// Seed: cria o usuário inicial a partir das variáveis de ambiente,
// os setores padrão e (na primeira vez) os dados de exemplo.
// É seguro rodar várias vezes: nunca sobrescreve a senha de um usuário existente.
//
// Variáveis: SEED_USER_LOGIN, SEED_USER_NAME, SEED_USER_PASSWORD, SEED_DEMO (true/false)

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ensureInitialSectors, loadDemoData } from "../src/lib/demo";
import { todayISO } from "../src/lib/dates";

async function main() {
  const login = process.env.SEED_USER_LOGIN?.trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD;
  const name = process.env.SEED_USER_NAME?.trim() || "Pedro";
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!url) throw new Error("DATABASE_URL não configurada.");
  if (!login || !password) {
    console.log("Seed: SEED_USER_LOGIN/SEED_USER_PASSWORD ausentes. Nada a fazer.");
    return;
  }
  if (password.length < 8) throw new Error("SEED_USER_PASSWORD precisa ter pelo menos 8 caracteres.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let user = await db.user.findUnique({ where: { login } });
    let created = false;
    if (!user) {
      user = await db.user.create({
        data: { login, name, passwordHash: await bcrypt.hash(password, 12), settings: { create: {} } },
      });
      created = true;
      console.log(`Seed: usuário "${login}" criado.`);
    } else {
      console.log(`Seed: usuário "${login}" já existe (senha mantida).`);
    }

    await ensureInitialSectors(db, user.id);

    const wantsDemo = (process.env.SEED_DEMO ?? "true").toLowerCase() !== "false";
    const hasData = await db.action.count({ where: { ownerId: user.id } });
    if (created && wantsDemo && hasData === 0) {
      await loadDemoData(db, user.id, todayISO());
      console.log("Seed: dados de exemplo carregados.");
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
