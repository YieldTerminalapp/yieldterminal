// verify new instructions: execute_strategy + close_vault path
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const keypairPath = resolve(__dirname, '..', '..', 'deploy-keypair.json');
const idlPath = resolve(__dirname, '..', 'src', 'idl.json');

const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))));
const idl = JSON.parse(readFileSync(idlPath, 'utf8'));

const conn = new Connection(rpc, 'confirmed');
const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(authority), { commitment: 'confirmed' });
const program = new anchor.Program(idl, provider);
const PID = program.programId;

const [config] = PublicKey.findProgramAddressSync([Buffer.from('yield_config')], PID);
const all = await program.account.yieldVault.all();
console.log('vaults on chain:', all.length);

for (const r of all) {
  const before = r.account.performanceBps;
  const deltaBps = 85; // +0.85% per tick (fake crank yield)
  const sig = await program.methods
    .executeStrategy(deltaBps)
    .accounts({ config, vault: r.publicKey, authority: authority.publicKey })
    .rpc();
  const after = (await program.account.yieldVault.fetch(r.publicKey)).performanceBps;
  console.log(`  ${r.account.name.padEnd(26)} perf_bps ${before} → ${after}  (tx ${sig.slice(0, 8)}…)`);
}
