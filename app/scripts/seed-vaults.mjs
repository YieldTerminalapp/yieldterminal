// seed demo vaults so fresh visitors see something on the Vaults page
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const keypairPath = resolve(__dirname, '..', '..', 'deploy-keypair.json');
const idlPath = resolve(__dirname, '..', 'src', 'idl.json');

const creator = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))));
const idl = JSON.parse(readFileSync(idlPath, 'utf8'));

const conn = new Connection(rpc, 'confirmed');
const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(creator), { commitment: 'confirmed' });
const program = new anchor.Program(idl, provider);
const PID = program.programId;

const SEEDS = [
  {
    name: 'SOL Covered Call',
    kind: { coveredCall: {} },
    blocks: [
      { action: { stake: {} },    protocol: { marinade: {} }, allocationPct: 60 },
      { action: { sellCall: {} }, protocol: { drift: {} },    allocationPct: 40 },
    ],
    deposit: 0.04,
  },
  {
    name: 'Stablecoin Yield Farm',
    kind: { yieldFarm: {} },
    blocks: [
      { action: { lend: {} },      protocol: { kamino: {} }, allocationPct: 55 },
      { action: { lpProvide: {} }, protocol: { kamino: {} }, allocationPct: 45 },
    ],
    deposit: 0.08,
  },
];

const [config] = PublicKey.findProgramAddressSync([Buffer.from('yield_config')], PID);

for (const s of SEEDS) {
  const cfg = await program.account.yieldConfig.fetch(config);
  const id = new anchor.BN(cfg.totalVaults.toString());
  const idBuf = id.toArrayLike(Buffer, 'le', 8);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), creator.publicKey.toBuffer(), idBuf], PID);

  const sig = await program.methods
    .createVault(s.name, s.kind, s.blocks)
    .accounts({ config, vault, creator: creator.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  console.log(`seeded #${id.toString()} ${s.name}: ${vault.toBase58()} (${sig.slice(0, 10)}…)`);

  const [userDeposit] = PublicKey.findProgramAddressSync(
    [Buffer.from('deposit'), vault.toBuffer(), creator.publicKey.toBuffer()], PID,
  );
  await program.methods
    .deposit(new anchor.BN(s.deposit * LAMPORTS_PER_SOL))
    .accounts({ vault, userDeposit, user: creator.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  console.log(`  + seeded ${s.deposit} SOL deposit`);
}

const all = await program.account.yieldVault.all();
console.log('\n✓ total vaults on devnet:', all.length);
