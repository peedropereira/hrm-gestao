// Redefine login, nome e senha do usuário administrador (ex.: esqueceu a senha).
// Uso: RESET_LOGIN="pedro souza" RESET_PASSWORD="..." [RESET_NAME="Pedro"] npm run db:reset-user
// Todas as sessões abertas deixam de valer.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const login = process.env.RESET_LOGIN?.trim().toLowerCase();
  const password = process.env.RESET_PASSWORD;
  const name = process.env.RESET_NAME?.trim();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  if (!login || !password) throw new Error("Informe RESET_LOGIN e RESET_PASSWORD.");
  if (password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!admin) throw new Error("Nenhum usuário encontrado. Rode o seed primeiro.");
    await db.user.update({
      where: { id: admin.id },
      data: { login, ...(name && { name }), passwordHash: await bcrypt.hash(password, 12), sessionVersion: { increment: 1 } },
    });
    await db.loginAttempt.deleteMany({ where: { login } });
    console.log(`Usuário atualizado: login "${login}".`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
