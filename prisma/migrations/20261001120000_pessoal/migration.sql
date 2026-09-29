-- AlterTable
ALTER TABLE "Sector" ADD COLUMN     "personal" BOOLEAN NOT NULL DEFAULT false;


-- Cria o setor "Pessoal" para cada usuário que ainda não tem
INSERT INTO "Sector" ("id", "ownerId", "name", "slug", "color", "icon", "order", "active", "personal", "createdAt", "updatedAt")
SELECT 'pessoal-' || u."id", u."id", 'Pessoal', 'pessoal', '#475569', 'user', -1, true, true, now(), now()
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "Sector" s WHERE s."ownerId" = u."id" AND s."slug" = 'pessoal');
