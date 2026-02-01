# Biblioteca Virtual Académica (API)

Backend completo em Node.js + TypeScript + Express com duas bases PostgreSQL simuladas (CEAD e Biblioteca) e streaming protegido de PDFs com suporte a Range Requests.

## Requisitos
- Node.js 18+
- Docker + Docker Compose (opcional para bases)

## Setup rápido (desenvolvimento)
1) Subir bases de dados:
```
docker compose up
```

2) Instalar dependências:
```
npm install
```

3) Criar `.env` (baseado em `.env.example`) e iniciar:
```
npm run dev
```

API por defeito em `http://localhost:4000`.

## Produção (VMware)
1) Instalar Node.js 18+ e PostgreSQL.
2) Configurar `.env` com valores reais (não usar `JWT_SECRET=super-secret`).
3) Instalar dependências sem dev:
```
npm ci --omit=dev
```
4) Compilar e iniciar:
```
npm run build
NODE_ENV=production node dist/server.js
```
5) Executar migrations/seeders conforme necessário:
```
npm run migrate:up
npm run seed:up
```

## Variáveis de ambiente
- `DATABASE_URL_CEAD` e `DATABASE_URL_BIBLIOTECA`
- `JWT_SECRET` e `JWT_EXPIRES_IN`
- `CORS_ORIGIN`
- `STORAGE_PDF_DIR` e `STORAGE_COVER_DIR`

## Fluxo de autenticação
- `POST /api/auth/login` tenta login local; se não existir, valida no CEAD e cria utilizador local.
- Resposta inclui `token` (JWT) e `needsProfile`.
- Todas as rotas `/api/*` (exceto `/api/auth/login`) exigem `Authorization: Bearer <token>`.

## Exemplos de requests (curl)

### Health
```
curl http://localhost:4000/health
```

### Login
```
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"codigo":"CEAD001","password":"Password123!"}'
```

### Completar perfil
```
curl -X POST http://localhost:4000/api/me/complete-profile \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"curso":"Engenharia Informática","ano":1,"semestre":1}'
```

### Criar material (multipart)
```
curl -X POST http://localhost:4000/api/materials \
  -H "Authorization: Bearer <token-admin>" \
  -F "pdf=@/caminho/para/ficheiro.pdf" \
  -F "capa=@/caminho/para/capa.jpg" \
  -F "titulo=Introdução" \
  -F "descricao=Material base" \
  -F "kind=MODULO" \
  -F "visibility=PRIVADO" \
  -F "curso=Engenharia Informática" \
  -F "ano=1" \
  -F "semestre=1" \
```

### Reader URL + PDF streaming
```
curl -H "Authorization: Bearer <token>" http://localhost:4000/api/materials/<id>/reader-url
curl -H "Authorization: Bearer <token>" http://localhost:4000/api/materials/<id>/pdf
```

### Favoritos
```
curl -X POST -H "Authorization: Bearer <token>" http://localhost:4000/api/favorites/<materialId>
```

## Notas importantes sobre PDFs
- PDFs são guardados em `storage/pdfs/` e **não** são servidos estaticamente.
- O endpoint `/api/materials/:id/pdf`:
  - exige autenticação
  - valida permissões
  - faz streaming com `Range` (206)
  - responde inline com headers de segurança

## Seeds
- **CEAD**: 3 utilizadores (`CEAD001..003`) com password `Password123!`.
- **Biblioteca**: 1 admin (`ADMIN001`) com password `Admin123!`.

## Migrations/Seeders (biblioteca_db)
```
npm run migrate:up
npm run seed:up
```

Para reverter:
```
npm run seed:down
npm run migrate:down
```

## Estrutura
```
src/
  config/
  db/
  middlewares/
  utils/
  modules/
    auth/
    me/
    materials/
    favorites/
    reading-progress/
  server.ts
```
<<<<<<< HEAD

>>>>>>> b49a232 (Initial commit)
=======
>>>>>>> a4b6ced (Normalize line endings to LF)
