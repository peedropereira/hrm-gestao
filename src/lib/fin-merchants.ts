// Dedução de categoria pelo nome do estabelecimento, como aparece na fatura.
// Funciona com nomes "grudados" (OuroBrancoPanific, VillaBovina, DROGASIL3380), com prefixos de
// maquininha/intermediador (EC *, PG*, MP *, PAYPAL *, HNA*) e com o final do cartão do Nubank (•••• 9646).

import { norm } from "./nl-parse";

/** Limpa o texto da fatura e deixa só o estabelecimento, em minúsculas e sem acento. */
export function cleanMerchant(description: string) {
  return norm(description)
    .replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, " ") // parcela
    .replace(/[•·]+\s*\d{4}/g, " ") // final do cartão
    .replace(/^\s*\d{1,2}\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/, " ")
    .replace(/\b(ec|pg|mp|pag|paypal|hna|htm|ebn|vmt|ctk|app|nuv|ifd|sumup|stone|iz|picpay|pagseguro|mercadopago|dm|lojas?)\s?\*\s?/g, " ")
    .replace(/\b(ltda|me|epp|eireli|s\/?a|comercio|com|de|da|do|e)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pedaços de nome → categoria. Testados também no nome sem espaços, então pegam palavras grudadas.
 * A ordem importa: os mais específicos primeiro.
 */
export const MERCHANT_STEMS: [string[], string][] = [
  [["amazonprime", "primevideo", "netflix", "spotify", "disneyplus", "disney", "hbomax", "globoplay", "youtubepremium", "deezer", "paramount", "premiere", "crunchyroll", "applemusic", "appletv"], "Streaming"],
  [["icloud", "applecom", "googleone", "googlestorage", "claudeai", "anthropic", "openai", "chatgpt", "microsoft", "office365", "adobe", "canva", "dropbox", "livelo", "smiles", "alertadevoo", "authen"], "Assinaturas e apps"],
  [["petz", "cobasi", "petlove", "petshop", "veterin", "racao", "petsaude", "caramelopet"], "Ração"],
  [["cytolab", "laborat", "fleury", "hospital", "clinica", "odonto"], "Consultas e exames"],
  [["mercadolivre", "shopee", "aliexpress", "shein", "temu", "amazon", "magalu", "magazineluiza", "casasbahia", "americanas", "submarino", "tiktok", "kabum", "fastshop", "pontofrio", "midea", "lojasrenner", "meuape", "klpcomercial", "sarafian"], "Compras e lojas"],
  [["drogasil", "drogaria", "drogaraia","farma", "paguemenos", "panvel", "pacheco", "drogao", "ultrafarma", "nissei", "saojoaofarm"], "Farmácia"],
  [["ifood", "rappi", "zedelivery", "aiqfome", "delivery"], "Delivery"],
  [["panific", "padaria", "paes", "doctorpao", "confeitaria", "boulang"], "Padaria"],
  [["hortifrut", "bigfruta", "quitanda", "sacolao", "hortlourenco", "feira", "verdemix", "fruta"], "Feira / Hortifrúti"],
  [["supermerc", "atacadao", "assai", "carrefour", "paodeacucar", "sonda", "oxxo", "mercearia", "minimercado", "emporio", "sams", "makro", "nagumo","shibata", "hirota"], "Supermercado"],
  [["autoposto", "posto", "combust", "shell", "ipiranga", "petrobras", "brmania", "ecoposto"], "Combustível"],
  [["brpark", "estapar", "estacion", "zonaazul", "semparar", "conectcar", "veloe", "pedagio", "multipark", "indigo"], "Estacionamento / Pedágio"],
  [["uber", "99app", "99pop", "cabify", "indriver"], "Aplicativos de transporte"],
  [["latam", "azullinhas", "voeazul", "gollinhas", "voegol", "decolar", "booking", "airbnb", "hotel", "hoteis", "pousada", "resort", "cvc", "123milhas", "maxmilhas", "viaj", "hurb", "turismo"], "Viagens"],
  [["barbear", "barbeiro", "salao", "cabeleir", "manicure", "esmalter", "estetica", "depil", "sobrancel", "boticario", "natura", "sephora", "cosmet", "beleza", "perfum", "alicesalazar", "spa ", "meetha", "reforcenatural"], "Cuidados pessoais"],
  [["medicina", "clinica", "consultorio", "hospital", "laborat", "cytolab", "fleury", "dasa", "odonto", "dentist", "fisioter", "psicolog", "exame", "unimed", "protg"], "Consultas e exames"],
  [["academia", "smartfit", "bluefit", "bodytech", "crossfit", "wellhub", "gympass", "totalpass", "iguanasport", "sports", "esporte", "centauro", "decathlon"], "Academia / Esporte"],
  [["petz", "cobasi", "petlove", "petshop", "veterin", "racao", "petsaude", "caramelopet", "pet "], "Ração"],
  [["playstation", "playstati", "psn", "xbox", "nintendo", "steam", "yuupgames", "games"], "Hobbies"],
  [["livraria", "saraiva", "livro", "kindle"], "Livros"],
  [["apptick", "ingresso", "sympla", "eventim", "ticket", "cinema", "cinemark", "kinoplex", "teatro", "parque", "arenaloc", "arena", "show"], "Passeios e eventos"],
  [["pagodinho", "choperia", "cervej", "boteco", "barzinho", "bardo", "pub "], "Bares"],
  [["restaur", "resta ", "gastronom", "bovina", "steak", "churrasc", "grill", "coxinha", "pastel", "lanche", "lanchon", "bobs", "burger", "mcdonald", "habib", "outback", "madero", "sushi", "temaki", "pizz", "cafe", "bistro", "sobremesa", "doceria", "sorvet", "acai", "zigpay", "salsalito", "rancho", "cantina", "tratt", "esfiha", "kfc", "subway", "giraffas", "spoleto", "cocobambu", "rodosnack", "petit", "olimpiabella", "cozinha", "comida", "dolcissimo", "nonocafe", "starbucks"], "Restaurantes"],
  [["calcad", "roupa", "moda", "renner", "riachuelo", "zara", "netshoes", "hering", "marisa", "youcom", "semijoia", "joia", "relojo", "otica", "goold", "fivesemi", "goodspell"], "Roupas e calçados"],
  [["flores", "flore ", "floricult", "cristalflores", "presente"], "Presentes"],
  [["materiais", "materialconst", "eletric", "leroy", "telhanorte", "cec ", "madeira", "ferrament", "ecolimp", "limpeza", "jadematerial", "casarecuper", "construc", "tintas"], "Manutenção da casa"],
  [["enxoval", "camaemesa", "tokstok", "etna", "mobly", "moveis", "decor", "utilidade"], "Móveis e utensílios"],
  [["escola", "colegio", "faculdade", "universidade", "mensalidade"], "Escola / Faculdade"],
  [["curso", "g4educacao", "udemy", "alura", "hotmart", "coursera", "kiwify", "eduzz"], "Cursos"],
  [["vivo", "claro", "timbrasil", "oitelecom", "recarga"], "Celular"],
  [["iof", "multaporfatura", "juros", "encargo", "valorpendente", "anuidade"], "Juros e encargos"],
  [["seguro", "porto seguro", "azulseguros"], "Seguro do carro"],
  // genéricos por último: lojas de shopping e variedades
  [["shopping", "daiso", "bubblebox", "lojas", "store", "magazine", "variedades", "presentes"], "Compras e lojas"],
];

/** Pagamento a pessoa física pela maquininha/PIX no cartão: "50334970Conceicao", "45829161renata". */
const PERSON = /^\s*\d{8,14}\s?[a-z]+/;

/** Nome da categoria provável, ou null. */
export function merchantCategory(description: string): string | null {
  const clean = cleanMerchant(description);
  if (!clean) return null;
  const spaced = ` ${clean} `;
  const glued = clean.replace(/\s+/g, "");
  for (const [stems, cat] of MERCHANT_STEMS) {
    for (const s of stems) {
      // pedaços com espaço ("pet ", "resta ") só valem como palavra; os outros também grudados
      if (s.includes(" ") ? spaced.includes(` ${s}`) : glued.includes(s)) return cat;
    }
  }
  if (PERSON.test(clean)) return "Outros gastos";
  return null;
}
