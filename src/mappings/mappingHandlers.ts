import { SubstrateEvent } from "@subql/types";
import { Account, AccountBalance, PublicKey, Transfer } from "../types";
import { Balance, AccountId } from "@polkadot/types/interfaces";
import { decodeAddress } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";

async function ensureAccount(
  accountId: string,
  publicKey: string,
  network: "polkadot" | "kusama"
): Promise<void> {
  const account = await Account.get(accountId);
  if (!account) {
    const newAccount = new Account(accountId);
    newAccount.network = network;
    await ensurePublicKey(publicKey);
    newAccount.publicKeyId = publicKey;
    await newAccount.save();
  }
}

async function ensurePublicKey(pk: string): Promise<void> {
  const publicKey = await PublicKey.get(pk);
  if (!publicKey) {
    await new PublicKey(pk.toString()).save();
  }
}

async function handleEvent(
  event: SubstrateEvent,
  network: "polkadot" | "kusama"
): Promise<void> {
  // The balances.transfer event has the following payload \[from, to, value\] that we can access
  const fromAddress = event.event.data[0] as AccountId;
  const toAddress = event.event.data[1] as AccountId;
  const amount = event.event.data[2];

  const fromPk = u8aToHex(decodeAddress(fromAddress.toString()));
  const toPk = u8aToHex(decodeAddress(toAddress.toString()));
  await Promise.all([
    ensureAccount(fromAddress.toString(), fromPk, network),
    ensureAccount(toAddress.toString(), toPk, network),
  ]);

  // We prefix the ID with the network name to prevent ID collisions across networks
  const transfer = new Transfer(
    `${network}-${event.block.block.header.number.toNumber()}-${event.idx}`
  );
  transfer.blockNumber = event.block.block.header.number.toBigInt();
  transfer.fromId = toAddress.toString();
  transfer.fromPkId = fromPk;
  transfer.toId = toAddress.toString();
  transfer.toPkId = toPk;
  transfer.amount = (amount as Balance).toBigInt();
  transfer.network = network;
  await Promise.all([
    updateBalance(transfer.fromId, fromPk, transfer.blockNumber, network),
    updateBalance(transfer.toId, toPk, transfer.blockNumber, network),
    transfer.save(),
  ]);
}

async function updateBalance(
  account: string,
  publicKey: string,
  blockHeight: bigint,
  network: "polkadot" | "kusama"
) {
  let {
    data: { free: previousFree },
    nonce: previousNonce,
  } = await api.query.system.account(account);
  const newBalance = new AccountBalance(`${account}-${blockHeight}`);
  newBalance.balance = previousFree.toBigInt();
  newBalance.accountId = account;
  newBalance.network = network;
  newBalance.publicKeyId = publicKey;
  newBalance.blockNumber = blockHeight;
  await newBalance.save();
}

// We have two handlers here to allow us to save the correct source network of the transfer
export async function handlePolkadotEvent(e: SubstrateEvent): Promise<void> {
  await handleEvent(e, "polkadot");
}

export async function handleKusamaEvent(e: SubstrateEvent): Promise<void> {
  await handleEvent(e, "kusama");
}
