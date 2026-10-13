import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getAccounts, toTxDTO } from "@/lib/finance";
import { ContasView } from "./contas-view";

export const metadata: Metadata = { title: "Contas e cartões" };

export default async function ContasPage() {
  const user = await requireUser();
  const { accounts, invoices } = await getAccounts(user.id);
  const cardIds = accounts.filter((a) => a.type === "CREDIT_CARD").map((a) => a.id);
  const cardTx = cardIds.length
    ? (await db.finTransaction.findMany({ where: { ownerId: user.id, deletedAt: null, accountId: { in: cardIds }, kind: { not: "TRANSFER" }, paid: false }, orderBy: { date: "desc" } })).map(toTxDTO)
    : [];
  return <ContasView accounts={accounts} invoices={invoices} cardTx={cardTx} />;
}
