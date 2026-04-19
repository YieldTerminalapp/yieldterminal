// smoke: createVault + deposit + fetch via same Program instance the UI uses.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const keypairPath = resolve(__dirname, '..', '..', 'deploy-keypair.json');
const idlPath = resolve(__dirname, '..', 'src', 'idl.json');

const secret = JSON.parse(readFileSync(keypairPath, 'utf8'));
const creator = Keypair.fromSecretKey(Uint8Array.from(secret));
const idl = JSON.parse(readFileSync(idlPath, 'utf8'));

const conn = new Connection(rpc, 'confirmed');
const wallet = new anchor.Wallet(creator);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
const program = new anchor.Program(idl, provider);
const PID = program.programId;

const [config] = PublicKey.findProgramAddressSync([Buffer.from('yield_config')], PID);
const cfg = await program.account.yieldConfig.fetch(config);
const nextId = new anchor.BN(cfg.totalVaults.toString());
const idBuf = nextId.toArrayLike(Buffer, 'le', 8);
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), creator.publicKey.toBuffer(), idBuf], PID);

const blocks = [
  { action: { stake: {} },     protocol: { marinade: {} }, allocationPct: 50 },
  { action: { lpProvide: {} }, protocol: { kamino: {} },   allocationPct: 50 },
];

console.log('vault #', cfg.totalVaults.toString(), '→', vault.toBase58());

const sigCreate = await program.methods
  .createVault('smoke-e2e', { deltaNeutral: {} }, blocks)
  .accounts({ config, vault, creator: creator.publicKey, systemProgram: SystemProgram.programId })
  .rpc();
console.log('create tx:', sigCreate);

const [userDeposit] = PublicKey.findProgramAddressSync(
  [Buffer.from('deposit'), vault.toBuffer(), creator.publicKey.toBuffer()],
  PID,
);

const sigDep = await program.methods
  .deposit(new anchor.BN(0.05 * LAMPORTS_PER_SOL))
  .accounts({ vault, userDeposit, user: creator.publicKey, systemProgram: SystemProgram.programId })
  .rpc();
console.log('deposit tx:', sigDep);

const vaultAcc = await program.account.yieldVault.fetch(vault);
const depAcc = await program.account.vaultDeposit.fetch(userDeposit);
console.log('vault.total_deposits:', Number(vaultAcc.totalDeposits) / LAMPORTS_PER_SOL, 'SOL');
console.log('vault.total_shares  :', Number(vaultAcc.totalShares));
console.log('deposit.shares      :', Number(depAcc.shares));

const all = await program.account.yieldVault.all();
console.log('total vaults on chain:', all.length);
