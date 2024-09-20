import solanaWeb3 from '@solana/web3.js'
import { struct, blob } from '@solana/buffer-layout'
import BN from 'bn.js'


function u64(property) {
    return blob(8, property);
}


function publicKey(property) {
    return blob(32, property);
}


const RPC = "https://api.mainnet-beta.solana.com";
const connection = new solanaWeb3.Connection(RPC, 'confirmed');

const POOL_ID = "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj";


const POOL_LAYOUT = struct([
    u64('baseReserve'),  
    u64('quoteReserve'), 
    publicKey('baseMint'),   
    publicKey('quoteMint'),  
]);

export async function getPoolMarketCap(poolId): Promise<BN> {
    try {
        // Get the account info
        const poolPublicKey = new solanaWeb3.PublicKey(poolId);
        const accountInfo = await connection.getAccountInfo(poolPublicKey);
        
        if (!accountInfo) {
            throw new Error("Pool ID is invalid or not found.");
        }

        // Parse the pool data
        const poolData = POOL_LAYOUT.decode(accountInfo.data);
        const baseReserve = new BN(poolData.baseReserve, 'le');
        const quoteReserve = new BN(poolData.quoteReserve, 'le');
        const baseMintAddress = new solanaWeb3.PublicKey(poolData.baseMint);
        const quoteMintAddress = new solanaWeb3.PublicKey(poolData.quoteMint);

        // console.log(`Base Token Mint: ${baseMintAddress.toBase58()}`);
        // console.log(`Quote Token Mint: ${quoteMintAddress.toBase58()}`);
        // console.log(`Base Token Reserve: ${baseReserve.toString()}`);
        // console.log(`Quote Token Reserve: ${quoteReserve.toString()}`);

        const baseTokenPrice = await getTokenPrice("SOL"); // Replace with correct base token symbol
        const quoteTokenPrice = await getTokenPrice("USDC"); // Replace with correct quote token symbol

        const baseTokenMarketCap = baseReserve.mul(new BN(baseTokenPrice * 1e6)).div(new BN(1e6));
        const quoteTokenMarketCap = quoteReserve.mul(new BN(quoteTokenPrice * 1e6)).div(new BN(1e6));

        const totalMarketCap = baseTokenMarketCap.add(quoteTokenMarketCap);
        console.log(`Total Market Cap: $${totalMarketCap.toString()}`);
        return totalMarketCap

    } catch (error) {
        console.error(`Error fetching market cap: ${error.message}`);
    }
}

async function getTokenPrice(tokenSymbol) {
    const prices = {
        'SOL': 20, 
        'USDC': 1, 
    };
    return prices[tokenSymbol];
}


