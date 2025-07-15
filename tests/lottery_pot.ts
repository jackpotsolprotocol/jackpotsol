import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import { BN } from "bn.js";
import {
  Orao
} from "@orao-network/solana-vrf";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from 'bs58';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bytesToNumber(bytes: Uint8Array, start = 0, length = 8): bigint {
  // Convert bytes slice to a BigInt (assuming little endian or big endian)
  // Solana generally uses little endian for numbers
  let value = BigInt(0);
  for (let i = 0; i < length; i++) {
    value += BigInt(bytes[start + i]) << BigInt(8 * i);
  }
  return value;
}
function mapToRange(value: bigint, maxExclusive: number): number {
  // Map bigint value to a number in [0, maxExclusive-1]
  return Number(value % BigInt(maxExclusive));
}
describe("lottery-pot", () => {
  const provider = anchor.AnchorProvider.env(); // base connection
  anchor.setProvider(provider); // set initially for airdrop

  const program = anchor.workspace.lotteryPot as anchor.Program;

  const backendAuthority = Keypair.fromSecretKey(bs58.decode(process.env.BACKEND_AUTHORITY));
  let vaultAta: anchor.web3.PublicKey;
  const ticketPrice = new BN(1_000_000_00);
  const ticketCapacity = new BN(10000000);

  const buyers: anchor.web3.Keypair[] = Array.from({ length: 5 }, () =>
    anchor.web3.Keypair.generate()
  );
  const buyerAtas: anchor.web3.PublicKey[] = [];

  let winner = buyers[2]; // pick a random winner for testing
  let winnerAta: anchor.web3.PublicKey;

  it("Airdrops SOL and creates mint + accounts", async () => {
    const provider = anchor.getProvider();
    // Create vault ATA for backend (will act as vault)
    vaultAta = await getAssociatedTokenAddress(new PublicKey('So11111111111111111111111111111111111111112'), backendAuthority.publicKey);
    const accountInfo = await provider.connection.getAccountInfo(vaultAta);
    console.log(accountInfo, 'accountInfo')
    if (!accountInfo) {
      vaultAta = await createAssociatedTokenAccount(
        provider.connection,
        backendAuthority,
        new PublicKey('So11111111111111111111111111111111111111112'),
        backendAuthority.publicKey
      );
    }
    console.log(vaultAta)

    // Create buyer ATAs and mint ticket tokens to them
    // for (const buyer of buyers) {
    // const tokenAccount = await getAssociatedTokenAddress(mint, new PublicKey('GgTuQFdcyWpso1HwWFkdcreqLNzGoNRhprTx6qaBhZtf'))
    // console.log(tokenAccount)
    // const ata = await createAssociatedTokenAccount(
    //   provider.connection,
    //   backendAuthority,
    //   mint,
    //   new PublicKey('GgTuQFdcyWpso1HwWFkdcreqLNzGoNRhprTx6qaBhZtf')
    // );
    // console.log(ata)
    // buyerAtas.push(ata);
    // await mintTo(
    //   provider.connection,
    //   backendAuthority,
    //   mint,
    //   ata,
    //   backendAuthority,
    //   ticketPrice.toNumber() * 10
    // );
    // }
  });
  const lotteryPotKeypair = Keypair.generate();
  it("Creates the lottery pot", async () => {
    const tx = await program.methods
      .createPot(ticketPrice, ticketCapacity)
      .accounts({
        lotteryPot: lotteryPotKeypair.publicKey,
        backendAuthority: backendAuthority.publicKey,
        mint: new PublicKey('So11111111111111111111111111111111111111112'),
        vault: new PublicKey('81Pu6F5AFZrtHWdohzQgCfBfR7nnQ3fCnSBVz7h3G6RR'),
        developerWallet: new PublicKey('GgTuQFdcyWpso1HwWFkdcreqLNzGoNRhprTx6qaBhZtf'),
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      }).transaction()
    tx.feePayer = backendAuthority.publicKey,
      tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
    tx.sign(backendAuthority, lotteryPotKeypair)
    const txSig = await provider.connection.sendRawTransaction(tx.serialize());
    console.log("✅ Pot created with tx:", txSig);
  });

  // it("Buys tickets (5 buyers)", async () => {
  //   const provider = anchor.getProvider();
  //   for (let i = 0; i < 5; i++) {
  //     const buyer = buyers[i];
  //     const ata = buyerAtas[i];

  //     const tx = await program.methods
  //       .buyTicket()
  //       .accounts({
  //         lotteryPot: lotteryPotKeypair.publicKey,
  //         buyer: buyer.publicKey,
  //         buyerTokenAccount: ata,
  //         vault: vaultAta,
  //         tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  //       })
  //       .transaction();
  //     // ✅ Fixes
  //     tx.feePayer = buyer.publicKey;
  //     tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;

  //     // ✅ Partial sign
  //     tx.sign(buyer);

  //     // ✅ Anchor's wallet will sign as feePayer
  //     // const signedTx = await provider.wallet.signTransaction(tx);

  //     const txSig = await provider.connection.sendRawTransaction(tx.serialize());
  //     await sleep(2000);
  //     console.log(`🎟️ Buyer ${i + 1} bought ticket: ${txSig}`);
  //   }
  // });

  // it("Fulfills randomness and pays winner", async () => {
  //   const provider = anchor.getProvider();

  //   const connection = new anchor.web3.Connection(
  //     'confirmed' // commitment level
  //   );

  //   // 2. Create or load a wallet (Keypair)
  //   const wallet = new anchor.Wallet(Keypair.generate());
  //   console.dir(wallet, { depth: null })
  //   await connection.requestAirdrop(
  //     wallet.publicKey,
  //     2 * anchor.web3.LAMPORTS_PER_SOL
  //   )
  //   await sleep(2000);
  //   // Alternatively, load wallet from local keypair file or secret key array
  //   // const secretKey = Uint8Array.from([...]);
  //   // const wallet = new anchor.Wallet(Keypair.fromSecretKey(secretKey));

  //   // 3. Create Anchor provider
  //   const vrfProvider = new anchor.AnchorProvider(connection, wallet, {
  //     commitment: 'confirmed',
  //   });

  //   const vrf = new Orao(vrfProvider);
  //   const tokenBalance = await provider.connection.getTokenAccountBalance(vaultAta);
  //   console.log("Vault Token balance:", tokenBalance.value.uiAmount);
  //   const [seed, tsx] = await (await vrf.request()).rpc();
  //   const randomness = await vrf.waitFulfilled(seed);
  //   const num = bytesToNumber(randomness.randomness, 0, 8);
  //   const mapped = mapToRange(num, buyers.length + 1);
  //   winner = buyers[mapped];
  //   winnerAta = await getAssociatedTokenAddress(mint, winner.publicKey);
  //   console.log(randomness, tsx);
  //   const tx = await program.methods
  //     .fulfillAndPayout(new BN(123456), winner.publicKey)
  //     .accounts({
  //       lotteryPot: lotteryPotKeypair.publicKey,
  //       authority: backendAuthority.publicKey,
  //       vault: vaultAta,
  //       winnerTokenAccount: winnerAta,
  //       tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  //     })
  //     .transaction(); // <-- use .transaction() instead of .rpc()

  //   // Set custom fee payer
  //   tx.feePayer = backendAuthority.publicKey;

  //   // Add recent blockhash
  //   tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;

  //   // Sign transaction
  //   tx.sign(backendAuthority);

  //   // Send manually
  //   const txSig = await provider.connection.sendRawTransaction(tx.serialize());

  //   console.log("🏆 Paid winner with tx:", txSig);
  //   await sleep(2000);
  //   const balance = await provider.connection.getTokenAccountBalance(winnerAta);
  //   assert.equal(
  //     balance.value.uiAmountString,
  //     (ticketPrice.toNumber() * ticketCapacity.toNumber() / 1_000_000).toString()
  //   );
  // });
});
