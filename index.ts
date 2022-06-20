// import admin from "firebase-admin";
// import credentials from "./credentials.json";
// const db = admin.initializeApp({ credential: admin.credential.cert(credentials as any) }).firestore();


import { providers, Wallet, Contract, BigNumber, utils } from "ethers";
import { TransactionReceipt } from "web3-core";
import axios from "axios";

import TokenAbi from "./abis/Token.json";
import StableAbi from "./abis/USDT.json";
import BridgeAssist from "./abis/BridgeAssist.json";
import BridgeAssistX from "./abis/BridgeAssistX.json";
import { walletPrivateKey } from "./secret";
const address_BABE = "0x15f354b660bCB94b80Fe467Ea63835CB47DEA247";
const address_BABX = "0xE1F2C848b10019ba50Dc7633Cd9913CB3D934c2a";
const address_BAEB = "0x67412cA1Aa3DcA2194b6E843E3c790FF4fFa87e4";
const address_BAEX = "0x7FdBe745ED1354248f9048A2C3051F4c11e29212";
const address_BAX = "0x7E75E882285d1d5Eebd96e03e890b8014cf08ba8";
const address_TKNB = "0x9caa60A2Ea0b767Dc2594579a17E69b644fA4104";
const address_TKNE = "0xB8D7372ee6Ff64fE464376d8FFC519ee4997064C";

const address_USDT = "0xac6a28d4486F8Cd435B061F48a8abA7E427eE029"; // "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const address_USDC = "0x3D66c8C260DEAc870b303Ff8b1Ba8d6Aa2b11662"; // "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const address_XUS = "0xB8D7372ee6Ff64fE464376d8FFC519ee4997064C"; // "0x91efa3FC448b7FCD40880F3ef650eB99635e6143";

const providerB = new providers.JsonRpcProvider("https://bsc-dataseed1.binance.org"); // for reading contracts
const providerE = new providers.InfuraProvider(3, "976b8b2358be48468b36d8739e79414e"); // for reading contracts
const providerX = new providers.JsonRpcProvider("http://18.136.152.176:8545/"); // for reading contracts
const signerB = new Wallet(walletPrivateKey, providerB);
const signerE = new Wallet(walletPrivateKey, providerE);
const signerX = new Wallet(walletPrivateKey, providerX);
const BABE = new Contract(address_BABE, BridgeAssist.abi, providerB);
const BABX = new Contract(address_BABX, BridgeAssist.abi, providerB);
const BAEB = new Contract(address_BAEB, BridgeAssist.abi, providerE);
const BAEX = new Contract(address_BAEX, BridgeAssist.abi, providerE);
const BAX = new Contract(address_BAX, BridgeAssistX.abi, providerX);
const TKNB = new Contract(address_TKNB, TokenAbi.abi, providerB);
const TKNE = new Contract(address_TKNE, TokenAbi.abi, providerE);

const USDT = new Contract(address_USDT, StableAbi.abi, providerE);
const USDC = new Contract(address_USDC, StableAbi.abi, providerB);
const XUS = new Contract(address_XUS, StableAbi.abi, providerX);

const latestNonces = { B: 0, E: 0, X: 0 };
// queues and buffer lifetime
const TIME_QUEUE = 300000;
const TIME_PARAMS = 30000;
const TIME_PRICE = 30000;

// import bunyan from "bunyan";
// import { LoggingBunyan } from "@google-cloud/logging-bunyan";
// const loggingBunyan = new LoggingBunyan();
// const logger = bunyan.createLogger({ name: "my-service", streams: [loggingBunyan.stream("debug")] });

// Info Buffers
type DirectionType = "BE" | "BX" | "EB" | "EX" | "XB" | "XE";
type CoinDirectionType = "DD" | "SS";
type ChangeableParams = { CTF: number; FTM: number; PSD: boolean };
type PricesBuffer = { date: number; prices: { TEP: number; TBP: number; TXP: number } };
type CostBuffer = { date: number; cost: BigNumber };
// let paramsBuffer = { date: 0, params: { CTF: 200, FTM: 200, PSD: false } as ChangeableParams };
let paramsBuffer = { date: 0, params: { CTF: 2, FTM: 110, PSD: false } as ChangeableParams };
let costBuffers = {
  BE: { date: 0, cost: BigNumber.from(0) },
  BX: { date: 0, cost: BigNumber.from(0) },
  EB: { date: 0, cost: BigNumber.from(0) },
  EX: { date: 0, cost: BigNumber.from(0) },
  XB: { date: 0, cost: BigNumber.from(0) },
  XE: { date: 0, cost: BigNumber.from(0) },
} as { [key in DirectionType]: CostBuffer };
let EGPBuffer = { date: 0, GP: BigNumber.from(0) };
let BGPBuffer = { date: 0, GP: BigNumber.from(0) };
let XGPBuffer = { date: 0, GP: BigNumber.from(0) };
let pricesBuffer = { date: 0, prices: { TEP: 0, TBP: 0, TXP: 0 } } as PricesBuffer;

function removeTrailingZeros(str: string): string {
  if (str === "0") return str;
  if (str.slice(-1) === "0") return removeTrailingZeros(str.substr(0, str.length - 1));
  if (str.slice(-1) === ".") return str.substr(0, str.length - 1);
  return str;
}
function BNToNumstr(bn: BigNumber | string, dec = 18, prec = 18): string {
  const str = bn.toString();
  if (str === "0") return str;
  if (isNaN(Number(str))) return "NaN";
  if (str.length <= dec) return removeTrailingZeros(("0." + "000000000000000000".substr(0, dec - str.length) + str).substr(0, dec - str.length + prec + 2));
  else return removeTrailingZeros([(str.substr(0, str.length - dec), str.slice(-dec))].join(".").substr(0, str.length - dec + prec + 1));
}

async function loadChangeableParams() {
  if (Date.now() - paramsBuffer.date < TIME_PARAMS) return paramsBuffer.params;
  try {
    // const params = (await db.collection("config").doc("changeables").get()).data() as ChangeableParams | undefined;
    const params = { CTF: 2, FTM: 110, PSD: false } as ChangeableParams;
    if (!params) throw new Error("Could not get config from firestore");
    paramsBuffer = { date: Date.now(), params };
    return params;
  } catch (error: any) {
    throw new Error(`Could not load params: ${error.reason || error.message}`);
  }
}
async function writeQueue(direction: DirectionType, address: string, coinDirection: CoinDirectionType) {
  try {
    // await db.collection(`queue${direction[0]}`).doc(address).create({ date: Date.now() });
  } catch (error: any) {
    throw new Error(`Could not write to queue: ${error.reason || error.message}`);
  }
}
async function clearQueue(direction: DirectionType, address: string) {
  try {
    // await db.collection(`queue${direction[0]}`).doc(address).delete();
  } catch (error: any) {
    throw new Error(`Could not clear queue: ${error.reason || error.message}`);
  }
}
async function assertQueue(direction: DirectionType, address: string, coinDirection: CoinDirectionType) {
  let entry: any;
  try {
    // entry = (await db.collection(`queue${direction[0]}`).doc(address).get()).data();
  } catch (error: any) {
    throw new Error(`Could not check request queue: ${error.reason || error.message}`);
  }
  if (entry) {
    if (Date.now() - entry.date < TIME_QUEUE) throw new Error(`Request done recently: timeout is 2min`);
    // else await db.collection(`queue${direction[0]}`).doc(address).delete(); // if it was left undeleted since last time
  }
}

async function getPrices() {
  if (Date.now() - pricesBuffer.date < TIME_PRICE) return pricesBuffer.prices;
  try {
    const [DBXtoETH, DBXtoBNB] = await Promise.all([
      axios.get('https://api.coingecko.com/api/v3/simple/price?ids=dbx-2&vs_currencies=eth'),
      axios.get('https://api.coingecko.com/api/v3/simple/price?ids=dbx-2&vs_currencies=bnb')
    ]);
    const TBP = DBXtoBNB.data["dbx-2"].bnb;
    const TEP = DBXtoETH.data["dbx-2"].eth;
    const TXP = 1;
    const prices = { TBP, TEP, TXP };
    pricesBuffer = { date: Date.now(), prices };
    return prices;
  } catch (error: any) {
    throw new Error(`Could not get prices: ${error.reason || error.message}`);
  }
}
// Calculate Cost
function _calcCost(gas: BigNumber, gasPrice: BigNumber, tknPrice: number) {
  return gasPrice
    .mul(gas)
    .mul(1e8)
    .div(Math.trunc(tknPrice * 1e8));
}
function calcCost(CG: BigNumber, CGP: BigNumber, TCP: number, DG: BigNumber, DGP: BigNumber, TDP: number) {
  return _calcCost(CG, CGP, TCP).add(_calcCost(DG, DGP, TDP));
}
// Get ETH Gas Price x1.2
async function _getEGP() {
  if (Date.now() - EGPBuffer.date < TIME_PRICE) return EGPBuffer.GP;
  try {
    const EGP = (await providerE.getGasPrice()).mul(120).div(100);
    EGPBuffer = { date: Date.now(), GP: EGP.lt(40e9) ? BigNumber.from(40e9) : EGP };
    // return EGP;
    return EGPBuffer.GP;
  } catch (error: any) {
    throw new Error(`Could not get ETH gas price: ${error.reason || error.message}`);
  }
}
async function _getBGP() {
  if (Date.now() - BGPBuffer.date < TIME_PRICE) return BGPBuffer.GP;
  try {
    const BGP = await providerB.getGasPrice();
    BGPBuffer = { date: Date.now(), GP: BGP };
    return BGP;
  } catch (error: any) {
    throw new Error(`Could not get BSC gas price: ${error.reason || error.message}`);
  }
}
async function _getXGP() {
  if (Date.now() - XGPBuffer.date < TIME_PRICE) return XGPBuffer.GP;
  try {
    const XGP = await providerX.getGasPrice();
    XGPBuffer = { date: Date.now(), GP: XGP };
    return XGP;
  } catch (error: any) {
    throw new Error(`Could not get DBX gas price: ${error.reason || error.message}`);
  }
}
// Estimate Cost
async function estimateCost(direction: DirectionType, coinDirection: CoinDirectionType) {
  if (Date.now() - Number(costBuffers[direction].date) < TIME_PRICE) return costBuffers[direction].cost;
  const _GPs = {
    BE: [BigNumber.from(26000), BigNumber.from(72000)],
    BX: [BigNumber.from(26000), BigNumber.from(58318)],
    EB: [BigNumber.from(26000), BigNumber.from(72000)],
    EX: [BigNumber.from(26000), BigNumber.from(58318)],
    XB: [BigNumber.from(15383), BigNumber.from(72000)],
    XE: [BigNumber.from(15383), BigNumber.from(72000)],
  }; // [collect() gas, dispense() gas]
  try {
    const _getGP = {
      BE: [_getBGP, _getEGP],
      BX: [_getBGP, _getXGP],
      EB: [_getEGP, _getBGP],
      EX: [_getEGP, _getXGP],
      XB: [_getXGP, _getBGP],
      XE: [_getXGP, _getEGP],
    };
    const [CGP, DGP, { TBP, TEP, TXP }] = await Promise.all([_getGP[direction][0](), _getGP[direction][1](), getPrices()]);
    const _TP = {
      BE: [TBP, TEP],
      BX: [TBP, TXP],
      EB: [TEP, TBP],
      EX: [TEP, TXP],
      XB: [TXP, TBP],
      XE: [TXP, TEP],
    };

    const cost = calcCost(BigNumber.from(_GPs[direction][0]), CGP, _TP[direction][0], BigNumber.from(_GPs[direction][1]), DGP, _TP[direction][1]);
    if (direction === "XE") console.log(_GPs[direction][0].toString(), CGP.toString(), _TP[direction][0], _GPs[direction][1].toString(), DGP.toString(), _TP[direction][1]);
    costBuffers[direction] = { date: Date.now(), cost };
    return cost;
  } catch (error: any) {
    throw new Error(`Could not estimate cost: ${error.reason || error.message}`);
  }
}
// Log out the block number
async function logBlock(direction: DirectionType, slot: 0 | 1) {
  const provider = [
    {
      BE: providerB,
      BX: providerB,
      EB: providerE,
      EX: providerE,
      XB: providerX,
      XE: providerX,
    },
    {
      BE: providerE,
      BX: providerX,
      EB: providerB,
      EX: providerX,
      XB: providerB,
      XE: providerE,
    },
  ][slot][direction];
  try {
    const bn = await provider.getBlockNumber();
    console.log(`Current block number (cid ${provider.network.chainId}) ${bn}`);
  } catch (error: any) {
    console.log(`!!! Could not log the block number (cid ${provider.network.chainId})`);
  }
}
// Estimate Fees applied
async function estimateFee(direction: DirectionType, coinDirection: CoinDirectionType = "DD") {
  try {
    const [cost, params] = await Promise.all([estimateCost(direction, coinDirection), loadChangeableParams()]);
    if (coinDirection === "SS" && (direction[0] === "E" || direction[0] === "X")) {
      return cost.mul(params.CTF).div(100000000000000);
    } else {
      return cost.mul(params.CTF).div(100);
    }
    
  } catch (error: any) {
    throw new Error(`Could not estimate fee: ${error.message}`);
  }
}
// Check safety of following swap attempt
async function assureAmount(direction: DirectionType, address: string, coinDirection: CoinDirectionType) {
  if (coinDirection === "SS") {
    const _STABLE = 
      {
        EB: USDT,
        EX: USDT,
        BE: USDC,
        BX: USDC,
        XE: XUS,
        XB: XUS
      }[direction];

      const _address_BA = {
        BE: address_BABE,
        BX: address_BABX,
        EB: address_BAEB,
        EX: address_BAEX,
        XE: address_BAX,
        XB: address_BAX,
      }[direction];
      
    const [allowance, balance]: [BigNumber, BigNumber] = await Promise.all([_STABLE.allowance(address, _address_BA), _STABLE.balanceOf(address)]);
    return { allowance, balance };
  } else if (direction === "XB" || direction === "XE") {
    const allowance = await BAX.locked(address);
    return { allowance, balance: null };
  } else {
    const _TKN = {
      BE: TKNB,
      BX: TKNB,
      EB: TKNE,
      EX: TKNE,
    }[direction];
    const _address_BA = {
      BE: address_BABE,
      BX: address_BABX,
      EB: address_BAEB,
      EX: address_BAEX,
    }[direction];
    const [allowance, balance]: [BigNumber, BigNumber] = await Promise.all([_TKN.allowance(address, _address_BA), _TKN.balanceOf(address)]);
    return { allowance, balance };
  }
}
async function assureSafety(direction: DirectionType, address: string, coinDirection: CoinDirectionType): Promise<{ allowance: BigNumber; fee: BigNumber }> {
  try {
    const [{ allowance, balance }, fee, params]: [{ allowance: BigNumber; balance: BigNumber | null }, BigNumber, ChangeableParams] = await Promise.all([
      assureAmount(direction, address, coinDirection),
      estimateFee(direction, coinDirection),
      loadChangeableParams(),
    ]);
    const min = fee.mul(params.FTM).div(100);
    console.log(`assureSafety(): [direction]:${direction}|[address]:${address}|[allowance]:${allowance}|[balance]:${balance}|[fee]:${fee}`);
    if (allowance.lt(min)) throw new Error(`Amount is too low. Should be not less than ${BNToNumstr(min, 18, 2)} DBX`);
    if (balance && allowance.gt(balance)) throw new Error(`Actual balance (${balance}) is lower than allowance (${allowance})`);
    return { allowance, fee };
  } catch (error: any) {
    throw new Error(`Assertion failure: ${error.reason || error.message}`);
  }
}
// Process requests
async function _collect(direction: DirectionType, address: string, amount: BigNumber, coinDirection: CoinDirectionType) {
  const _signer = {
    BE: signerB,
    BX: signerB,
    EB: signerE,
    EX: signerE,
    XB: signerX,
    XE: signerX,
  }[direction];
  const _BA = {
    BE: BABE,
    BX: BABX,
    EB: BAEB,
    EX: BAEX,
    XB: BAX,
    XE: BAX,
  }[direction];
  const _getGP = {
    BE: _getBGP,
    BX: _getBGP,
    EB: _getEGP,
    EX: _getEGP,
    XB: _getXGP,
    XE: _getXGP,
  }[direction];
  let tx: providers.TransactionResponse;
  let receipt: providers.TransactionReceipt | TransactionReceipt;
  let err: Error;
  let _nonce: number;
  try {
    _nonce = await _signer.getTransactionCount();
    const _latestNonce = {
      BE: latestNonces.B,
      BX: latestNonces.B,
      EB: latestNonces.E,
      EX: latestNonces.E,
      XB: latestNonces.X,
      XE: latestNonces.X,
    }[direction];
    console.log(`_collect(${direction[0]}|${address}) (get_nonce) ${_nonce}|${latestNonces}`);
    if (_nonce <= _latestNonce) _nonce = _latestNonce + 1;
    if (direction === "BE" || direction === "BX") latestNonces.B = _nonce;
    if (direction === "EB" || direction === "EX") latestNonces.E = _nonce;
    if (direction === "XB" || direction === "XE") latestNonces.X = _nonce;
  } catch (error: any) {
    err = new Error(`[reason]:${error.reason}`);
    console.warn(`_collect(${direction[0]}|${address}) (get_nonce) failure...Info: [${err.message}|==|${error.message}]`);
    logBlock(direction, 0);
    return { err, tx: undefined, receipt: undefined };
  }
  try {
    const ptx =
      direction === "XB" || direction === "XE"
        ? await _BA.populateTransaction.collect(address, amount, direction === "XE", coinDirection === "SS")
        : await _BA.populateTransaction.collect(address, amount, coinDirection === "SS");
    ptx.gasPrice = await _getGP();
    ptx.nonce = _nonce;
    console.log(`_collect(${direction[0]}|${address}) ${ptx.nonce} send...`);
    tx = await _signer.sendTransaction(ptx);
  } catch (error: any) {
    err = new Error(`[reason]:${error.reason}`);
    console.log(`_collect(${direction[0]}|${address}) (ptx_send) failure... Info: [${err.message}|==|${error.message}]`);
    logBlock(direction, 0);
    return { err, tx: undefined, receipt: undefined };
  }
  try {
    console.log(`_collect(${direction[0]}|${address}) ${[tx.nonce, tx.hash]} wait...`);
    if (["XB", "XE"].includes(direction)) receipt = await _awaiterX(tx.hash);
    else receipt = await tx.wait();
    console.log(`_collect(${direction[0]}|${address}) ${receipt.transactionHash}|GAS ${receipt.gasUsed}/${tx.gasLimit}|GP ${BNToNumstr(tx.gasPrice as BigNumber, 9, 3)}`);
    return { err: undefined, tx, receipt };
  } catch (error: any) {
    err = new Error(`[reason]:${error.reason}|[tx]:${[tx.nonce, tx.hash]}`);
    console.log(`_collect(${direction[0]}|${address}) (tx_wait) failure... Info: [${err.message}|==|${error.message}]`);
    logBlock(direction, 0);
    return { err, tx, receipt: undefined };
  }
}
function _wait(ms = 5000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function _awaiterX(hash: string, attempt = 1): Promise<TransactionReceipt> {
  await _wait();
  const rec: {
    jsonrpc: "2.0";
    id: 1;
    result: null | {
      blockHash: string;
      blockNumber: string;
      contractAddress: null | string;
      cumulativeGasUsed: string;
      from: string;
      gasUsed: string;
      logs: any[];
      logsBloom: string;
      status: "0x1" | "0x0";
      to: string;
      transactionHash: string;
      transactionIndex: string;
    };
  } = (
    await axios.post("http://18.136.152.176:8545/", {
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [hash],
      id: 1,
    })
  ).data;
  const res = rec.result;
  if (res === null) {
    if (attempt < 4) {
      console.log(`...attempt ${attempt}: not mined yet`);
      return _awaiterX(hash, attempt + 1);
    } else throw new Error("4 attempts were not enough, seems like RPC error");
  } else {
    if (res.status !== "0x1") throw new Error(`Receipt raturned failed status. Transaction failed`);
    return {
      ...res,
      status: res.status !== "0x1",
      transactionIndex: Number(res.transactionIndex),
      blockNumber: Number(res.blockNumber),
      contractAddress: res.contractAddress || undefined,
      cumulativeGasUsed: Number(res.cumulativeGasUsed),
      gasUsed: Number(res.gasUsed),
      effectiveGasPrice: Number(0),
    };
  }
}
async function _dispense(
  direction: DirectionType,
  address: string,
  amount: BigNumber,
  coinDirection: CoinDirectionType,
  retriesLeft = 2,
  nonce?: number
): Promise<
  | { err: Error; tx: undefined; receipt: undefined }
  | { err: Error; tx: providers.TransactionResponse; receipt: undefined }
  | { err: undefined; tx: providers.TransactionResponse; receipt: providers.TransactionReceipt | TransactionReceipt }
> {
  const _signer = {
    BE: signerE,
    BX: signerX,
    EB: signerB,
    EX: signerX,
    XB: signerB,
    XE: signerE,
  }[direction];
  const _BA = {
    BE: BAEB,
    BX: BAX,
    EB: BABE,
    EX: BAX,
    XB: BABX,
    XE: BAEX,
  }[direction];
  const _getGP = {
    BE: _getEGP,
    BX: _getXGP,
    EB: _getBGP,
    EX: _getXGP,
    XB: _getBGP,
    XE: _getEGP,
  }[direction];
  let err: Error;
  let tx: providers.TransactionResponse;
  let receipt: providers.TransactionReceipt | TransactionReceipt;
  let _nonce: number;
  try {
    if (nonce !== undefined) _nonce = nonce;
    else {
      _nonce = await _signer.getTransactionCount();
      const _latestNonce = {
        BE: latestNonces.E,
        BX: latestNonces.X,
        EB: latestNonces.B,
        EX: latestNonces.X,
        XB: latestNonces.B,
        XE: latestNonces.E,
      }[direction];
      console.log(`_dispense(${direction[1]}|${address}) (get_nonce) ${_nonce}|${latestNonces}`);
      if (_nonce <= _latestNonce) _nonce = _latestNonce + 1;
      if (direction === "EB" || direction === "XB") latestNonces.B = _nonce;
      if (direction === "BE" || direction === "XE") latestNonces.E = _nonce;
      if (direction === "BX" || direction === "EX") latestNonces.X = _nonce;
    }
  } catch (error: any) {
    err = new Error(`[reason]:${error.reason}`);
    console.warn(`_dispense(${direction[1]}|${address}) (get_nonce) failure... Retries left: ${retriesLeft} | Info: [${err.message}|==|${error.message}]`);
    logBlock(direction, 1);
    if (retriesLeft) {
      await _wait();
      return await _dispense(direction, address, amount, coinDirection, retriesLeft - 1);
    } else return { err, tx: undefined, receipt: undefined };
  }
  try {
    const ptx =
      direction === "EX" || direction === "BX"
        ? await _BA.populateTransaction.dispense(address, amount, direction === "EX", coinDirection === "SS")
        : await _BA.populateTransaction.dispense(address, amount, coinDirection === "SS");
    ptx.gasPrice = await _getGP();
    ptx.nonce = _nonce;
    console.log(`_dispense(${direction[1]}|${address}) ${ptx.nonce} send...`);
    tx = await _signer.sendTransaction(ptx);
  } catch (error: any) {
    err = new Error(`[reason]:${error.reason}`);
    console.log(`_dispense(${direction[1]}|${address}) (ptx_send) failure... Retries left: ${retriesLeft} | Info: [${err.message}|==|${error.message}]`);
    logBlock(direction, 1);
    if (retriesLeft) {
      await _wait();
      return await _dispense(direction, address, amount, coinDirection, retriesLeft - 1, _nonce);
    } else return { err, tx: undefined, receipt: undefined };
  }
  try {
    console.log(`_dispense(${direction[1]}|${address}) ${[tx.nonce, tx.hash]} wait...`);
    if (["BX", "EX"].includes(direction)) receipt = await _awaiterX(tx.hash);
    else 
    receipt = await tx.wait();
    // console.log(`_dispense(${direction[1]}|${address}) ${receipt.transactionHash}|GAS ${receipt.gasUsed}/${tx.gasLimit}|GP ${BNToNumstr(tx.gasPrice as BigNumber, 9, 3)}`);
    return { err: undefined, tx, receipt };
  } catch (error: any) {
    err = new Error(`[reason]:${error.reason}|[tx]:${[tx.nonce, tx.hash]}`);
    console.log(`_dispense(${direction[1]}|${address}) (tx_wait) failure... Retries left: ${retriesLeft} | Info: [${err.message}|==|${error.message}]`);
    logBlock(direction, 1);
    return { err, tx, receipt: undefined };
  }
}
async function processRequest(direction: DirectionType, address: string, coinDirection: CoinDirectionType) {
  let err: Error;
  let txHashCollect: string;
  let txHashDispense: string;
  let sas: { allowance: BigNumber; fee: BigNumber };
  try {
    await writeQueue(direction, address, coinDirection);
    sas = await assureSafety(direction, address, coinDirection);
    const resC = await _collect(direction, address, sas.allowance, coinDirection);
    if (resC.err) throw new Error(`Could not collect: ${resC.err.message}`);
    txHashCollect = resC.receipt.transactionHash as string;
  } catch (error: any) {
    err = new Error(`Could not process request: ${error.message}`);
    return { err, txHashCollect: undefined, txHashDispense: undefined };
  }
  try {
    const resD = await _dispense(direction, address, sas.allowance.sub(sas.fee), coinDirection);
    if (resD.err) throw new Error(`Could not dispense: ${resD.err.message}`);
    txHashDispense = resD.receipt.transactionHash as string;
    try {
      await clearQueue(direction, address);
    } catch (error: any) {
      console.log(`clearQueue() failure... Error: ${error.message}`);
    }
    return { err: undefined, txHashCollect, txHashDispense };
  } catch (error: any) {
    err = new Error(`Could not process request: ${error.message}`);
    return { err, txHashCollect, txHashDispense: undefined };
  }
}




const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.get("/process", async (req: any, res: any) => {
  const direction = typeof req.query.direction === "string" ? (req.query.direction.toUpperCase() as DirectionType) : undefined;
  const address = typeof req.query.address === "string" ? (req.query.address as string).toLowerCase() : undefined;
  const coinDirection = typeof req.query.coinDirection === "string" ? (req.query.coinDirection.toUpperCase() as CoinDirectionType) : undefined;
  let dispenseFailure: false | string = false;
  try {
    if (!direction || !["BE", "BX", "EB", "EX", "XB", "XE"].includes(direction)) throw new Error("Invalid query: 'direction'");
    if (!coinDirection || !["DD", "SS"].includes(coinDirection)) throw new Error("Invalid query: 'coinDirection'");
    if (!address || !utils.isAddress(address) || address === "0x0000000000000000000000000000000000000000") throw new Error("Invalid query: 'address'");
    await assertQueue(direction, address, coinDirection);
  } catch (error: any) {
    res.status(400).send(error.message);
    return;
  }
  const _prefix = `[${direction}][${address}][${coinDirection}]`;
  try {
    console.log(`${_prefix}: Incoming request`);
    const result = await processRequest(direction, address, coinDirection);
    if (result.err) {
      // if asset was collected but not dispensed
      if (result.txHashCollect && !result.txHashDispense) dispenseFailure = result.txHashCollect;
      throw result.err;
    }
    console.log(`${_prefix}: Success. Collect: ${result.txHashCollect}, Dispense: ${result.txHashDispense}`);
    res.status(200).send({ txHashCollect: result.txHashCollect, txHashDispense: result.txHashDispense });
  } catch (error: any) {
    console.log(`${_prefix}: Failed. Error: ${error.message}`);
    if (dispenseFailure) {
      // if asset was collected but not dispensed
      // logger.fatal(`!!DISPENSE FAILED AFTER SUCCESSFUL COLLECT. TX HASH: [${dispenseFailure}]`);
      // only in that case response status is 500
      res
        .status(500)
        .send(
          "WARNING! Asset was collected but due to internal server error it wasn't dispensed to you on another blockchain. " +
            "Administrator shall soon receive automatic message and dispense manually. Or you can contact the support right now. | " +
            `collect() transaction hash: [${dispenseFailure}] | ` +
            `Error returned: ${error.reason || error.message}`
        );
    } else {
      res.status(400).send(error.reason || error.message);
    }
  }
});
app.get("/info", async (req: any, res: any) => {
  console.log("received request...")
  try {
    const BE = await estimateFee("BE");
    const BX = await estimateFee("BX");
    const EB = await estimateFee("EB");
    const EX = await estimateFee("EX");
    const XB = await estimateFee("XB");
    const XE = await estimateFee("XE");

    const BES = await estimateFee("BE", "SS");
    const BXS = await estimateFee("BX", "SS");
    const EBS = await estimateFee("EB", "SS");
    const EXS = await estimateFee("EX", "SS");
    const XBS = await estimateFee("XB", "SS");
    const XES = await estimateFee("XE", "SS");

    const { FTM, PSD } = await loadChangeableParams();
    res.status(200).send({
      BE: BE.toString(),
      BX: BX.toString(),
      EB: EB.toString(),
      EX: EX.toString(),
      XB: XB.toString(),
      XE: XE.toString(),

      BES: BES.toString(),
      BXS: BXS.toString(),
      EBS: EBS.toString(),
      EXS: EXS.toString(),
      XBS: XBS.toString(),
      XES: XES.toString(),

      MIN_BE: BE.mul(FTM).div(100).toString(),
      MIN_BX: BX.mul(FTM).div(100).toString(),
      MIN_EB: EB.mul(FTM).div(100).toString(),
      MIN_EX: EX.mul(FTM).div(100).toString(),
      MIN_XB: XB.mul(FTM).div(100).toString(),
      MIN_XE: XE.mul(FTM).div(100).toString(),

      MIN_BES: BES.mul(FTM).div(100).toString(),
      MIN_BXS: BXS.mul(FTM).div(100).toString(),
      MIN_EBS: EBS.mul(FTM).div(100).toString(), // decimal 6
      MIN_EXS: EXS.mul(FTM).div(100).toString(),
      MIN_XBS: XBS.mul(FTM).div(100).toString(),
      MIN_XES: XES.mul(FTM).div(100).toString(),

      PSD,
    });
  } catch (error: any) {
    res.status(400).send(error.reason || error.message);
  }
});
app.get("/nonces", async (req: any, res: any) => {
  res.status(200).send(latestNonces);
});
app.get("/hardresetnonces", async (req: any, res: any) => {
  try {
    if (req.query.devkey !== "xxxxxxxxxxxxx") throw new Error("Wrong devkey");
    latestNonces.B = (await signerB.getTransactionCount()) - 1;
    latestNonces.E = (await signerE.getTransactionCount()) - 1;
    latestNonces.X = (await signerX.getTransactionCount()) - 1;
    res.status(200).send(latestNonces);
  } catch (error: any) {
    res.status(400).send(error.reason || error.message);
  }
});
const port = process.env.PORT;
app.listen(port, async () => {
  latestNonces.B = (await signerB.getTransactionCount()) - 1;
  latestNonces.E = (await signerE.getTransactionCount()) - 1;
  latestNonces.X = (await signerX.getTransactionCount()) - 1;
  console.log(`Express app listening at port ${port}`);
});

// const https = require('https');
// const fs = require('fs');

// const options = {
//   key: fs.readFileSync('key.pem'),
//   cert: fs.readFileSync('cert.pem')
// };

// https.createServer(options, app).listen(port,  async () => {
//   latestNonces.B = (await signerB.getTransactionCount()) - 1;
//   latestNonces.E = (await signerE.getTransactionCount()) - 1;
//   latestNonces.X = (await signerX.getTransactionCount()) - 1;
//   console.log(`Express app listening at port ${port}`);
// });
