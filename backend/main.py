"""YieldTerminal backend — FastAPI + APScheduler in one process.

Endpoints:
  GET  /health
  GET  /apy                       -> per-protocol live APY
  GET  /apy/composition?blocks=.. -> weighted APY for a block composition
  POST /backtest                  -> monte-carlo backtest
  POST /risk                      -> risk score + VaR
  GET  /events?vault=...&limit=.. -> indexed events
  GET  /vaults/{pubkey}/history   -> time-series snapshots

Start: uvicorn backend.main:app --port 8080
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import siblings either as a package (`uvicorn backend.main:app` from repo
# root) or as plain modules (`uvicorn main:app` from inside backend/, the way
# Railway runs us when rootDirectory=backend).
try:
    from . import backtest, crank, db, indexer, risk, yields
    from .config import CRANK_INTERVAL_SEC, INDEX_INTERVAL_SEC
except ImportError:
    import backtest, crank, db, indexer, risk, yields  # type: ignore[no-redef]
    from config import CRANK_INTERVAL_SEC, INDEX_INTERVAL_SEC  # type: ignore[no-redef]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("main")


class Block(BaseModel):
    action: str
    protocol: str
    allocation_pct: int


class BacktestRequest(BaseModel):
    blocks: list[Block]
    days: int = 30
    runs: int = 50
    strategy_type: str | None = None


class RiskRequest(BaseModel):
    blocks: list[Block]
    strategy_type: str | None = None


def _index_job():
    try:
        n = indexer.index_tick()
        if n:
            log.info("indexer stored %d events", n)
        indexer.snapshot_tick()
    except Exception as e:
        log.warning("indexer job: %s", e)


def _crank_job():
    try:
        n = crank.tick()
        log.info("crank executed on %d vaults", n)
    except Exception as e:
        log.warning("crank job: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    sched = AsyncIOScheduler()
    sched.add_job(_index_job, "interval", seconds=INDEX_INTERVAL_SEC, id="indexer",
                  max_instances=1, coalesce=True, next_run_time=None)
    sched.add_job(_crank_job, "interval", seconds=CRANK_INTERVAL_SEC, id="crank",
                  max_instances=1, coalesce=True, next_run_time=None)
    sched.start()
    log.info("scheduler up — indexer every %ds, crank every %ds", INDEX_INTERVAL_SEC, CRANK_INTERVAL_SEC)
    # run an immediate indexer tick so endpoints have data
    await asyncio.get_running_loop().run_in_executor(None, _index_job)
    yield
    sched.shutdown(wait=False)


app = FastAPI(title="YieldTerminal API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/apy")
def apy():
    return {p: s.__dict__ for p, s in yields.all_protocols().items()}


@app.get("/apy/composition")
def composition(blocks: str):
    import json
    try:
        arr = json.loads(blocks)
    except Exception:
        raise HTTPException(400, "blocks must be JSON array")
    return {"weighted_apy": yields.composition_apy(arr)}


@app.post("/backtest")
def run_backtest(req: BacktestRequest):
    if not req.blocks:
        raise HTTPException(400, "need at least 1 block")
    if req.days < 7 or req.days > 365:
        raise HTTPException(400, "days must be 7..365")
    if req.runs < 5 or req.runs > 500:
        raise HTTPException(400, "runs must be 5..500")
    blocks = [b.model_dump() for b in req.blocks]
    result = backtest.run(blocks, days=req.days, runs=req.runs, strategy_type=req.strategy_type)
    return backtest.as_dict(result)


@app.post("/risk")
def run_risk(req: RiskRequest):
    blocks = [b.model_dump() for b in req.blocks]
    return risk.score(blocks, strategy_type=req.strategy_type)


@app.get("/events")
def events(vault: str | None = None, limit: int = 50):
    if limit < 1 or limit > 500:
        raise HTTPException(400, "limit must be 1..500")
    return {"events": db.recent_events(vault=vault, limit=limit)}


@app.get("/vaults/{pubkey}/history")
def vault_history(pubkey: str):
    return {"vault": pubkey, "snapshots": db.vault_history(pubkey, limit=500)}
