# Rotas da API (backend)

Base URL: `http://localhost:<PORTA>`

Autenticação:
- **Público**: `/health`, `/healthz`, `/api/public/*`, `/api/auth/login`, `/api/auth/logout`
- **Autenticado**: todo o resto em `/api/*` exige token JWT `Authorization: Bearer <token>`
- **Admin/Gestor**: indicado explicitamente nas rotas

## Health
- `GET /health` -> status simples
- `GET /healthz` -> verifica conexão com BD

## Auth (público)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me` (autenticado)

## Me (autenticado)
- `POST /api/me/complete-profile`
- `PATCH /api/me`
- `POST /api/me/password`

## Materiais públicos (público)
- `GET /api/public/materials` (filtros: `q`, `curso`, `ano`, `semestre`, `autor`, `anoPublicacao`, `sortBy`, `page`, `limit`)
- `GET /api/public/materials/:id`
- `GET /api/public/materials/:id/reader-url`
- `GET /api/public/materials/:id/cover`
- `GET /api/public/materials/:id/pdf`

## Materiais (autenticado)
- `GET /api/materials` (filtros: `q`, `kind`, `materialType`, `curso`, `ano`, `semestre`, `autor`, `anoPublicacao`, `visibility`, `status`, `sortBy`, `page`, `limit`)
- `GET /api/materials/temas-transversais`
- `GET /api/materials/modules/my-course`
- `GET /api/materials/:id`
- `POST /api/materials` (ADMIN/GESTOR, multipart: `pdf`, `capa`)
- `PATCH /api/materials/:id` (ADMIN/GESTOR)
- `PATCH /api/materials/:id/status` (ADMIN/GESTOR)
- `DELETE /api/materials/:id` (ADMIN/GESTOR)
- `GET /api/materials/:id/cover`
- `GET /api/materials/:id/reader-url`
- `GET /api/materials/:id/pdf`

## Favoritos (autenticado)
- `GET /api/favorites`
- `POST /api/favorites/:materialId`
- `DELETE /api/favorites/:materialId`

## Progresso de leitura (autenticado)
- `GET /api/reading-progress/materials` (paginação: `page`, `limit`)
- `GET /api/reading-progress` (query opcional: `materialId`)
- `PUT /api/reading-progress/:materialId`

## Coleções (autenticado)
- `GET /api/collections`
- `POST /api/collections`
- `PATCH /api/collections/:id`
- `DELETE /api/collections/:id`
- `POST /api/collections/:id/items`
- `DELETE /api/collections/:id/items/:materialId`

## Notas do leitor (autenticado)
- `GET /api/reader-notes` (query: `materialId`)
- `POST /api/reader-notes`
- `DELETE /api/reader-notes/:id`

## Metadados (autenticado)
- `GET /api/meta/courses`
- `GET /api/meta/academic`
- `GET /api/meta/years`
- `GET /api/meta/semesters`
- `GET /api/meta/material-types`

## Utilizadores (autenticado)
- `GET /api/users/stats` (ADMIN/GESTOR)
- `GET /api/users` (ADMIN)
- `GET /api/users/export` (ADMIN)
- `GET /api/users/audit` (ADMIN)
- `POST /api/users` (ADMIN)
- `PATCH /api/users/:id` (ADMIN)
- `POST /api/users/:id/reset-password` (ADMIN)
- `DELETE /api/users/:id` (ADMIN)

## Cursos (autenticado)
- `GET /api/courses` (ADMIN)
- `POST /api/courses` (ADMIN)
- `PATCH /api/courses/:id` (ADMIN)
- `DELETE /api/courses/:id` (ADMIN)

## Académico (autenticado)
- `GET /api/academic`
- `PUT /api/academic` (ADMIN)
