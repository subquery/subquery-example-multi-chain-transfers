import { SubstrateEvent } from "@subql/types";
import { Account, AccountBalance, PublicKey, Transfer } from "../types";
import { Balance, AccountId } from "@polkadot/types/interfaces";
import { decodeAddress } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";

let NETWORK;

export async function ensureAccount(
  accountId: string,
  publicKey: string
): Promise<void> {
  const account = await Account.get(accountId);
  if (!account) {
    const newAccount = new Account(accountId);
    newAccount.network = NETWORK;
    await ensurePublicKey(publicKey);
    newAccount.publicKeyId = publicKey;
    await newAccount.save();
  }
}

export async function ensurePublicKey(pk: string): Promise<void> {
  const publicKey = await PublicKey.get(pk);
  if (!publicKey) {
    await new PublicKey(pk.toString()).save();
  }
}

export async function handleEvent(event: SubstrateEvent): Promise<void> {
  // The balances.transfer event has the following payload \[from, to, value\] that we can access
  const fromAddress = event.event.data[0] as AccountId;
  const toAddress = event.event.data[1] as AccountId;
  const amount = event.event.data[2];

  const fromPk = u8aToHex(decodeAddress(fromAddress.toString()));
  const toPk = u8aToHex(decodeAddress(toAddress.toString()));
  await Promise.all([
    ensureAccount(fromAddress.toString(), fromPk),
    ensureAccount(toAddress.toString(), toPk),
  ]);

  const transfer = new Transfer(
    `${NETWORK}-${event.block.block.header.number.toNumber()}-${event.idx}`
  );
  transfer.blockNumber = event.block.block.header.number.toBigInt();
  transfer.fromId = toAddress.toString();
  transfer.fromPkId = fromPk;
  transfer.toId = toAddress.toString();
  transfer.toPkId = toPk;
  transfer.amount = (amount as Balance).toBigInt();
  transfer.network = NETWORK;
  // await Promise.all([updateBalance(transfer.fromId,fromPk,transfer.blockNumber),updateBalance(transfer.toId, toPk,transfer.blockNumber)])
  await transfer.save();
}

export async function updateBalance(
  account: string,
  publicKey: string,
  blockHeight: bigint
) {
  let {
    data: { free: previousFree },
    nonce: previousNonce,
  } = await api.query.system.account(account);
  const newBalance = new AccountBalance(`${account}-${blockHeight}`);
  newBalance.balance = previousFree.toBigInt();
  newBalance.accountId = account;
  newBalance.network = NETWORK;
  newBalance.publicKeyId = publicKey;
  newBalance.blockNumber = blockHeight;
  await newBalance.save();
}

export async function handlePolkadotEvent(
  event: SubstrateEvent
): Promise<void> {
  NETWORK = "polkadot";
  await handleEvent(event);
}

export async function handleKusamaEvent(event: SubstrateEvent): Promise<void> {
  NETWORK = "kusama";
  await handleEvent(event);
}
