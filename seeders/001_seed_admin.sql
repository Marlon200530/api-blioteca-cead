-- migrate:up
\connect biblioteca_db

INSERT INTO users (id, codigo, nome, password_hash_local, role, status)
VALUES (gen_random_uuid(), 'ADMIN001', 'Admin', crypt('Admin123!', gen_salt('bf')), 'ADMIN', 'ATIVO')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO user_profile (user_id, completed_profile)
SELECT id, false FROM users WHERE codigo = 'ADMIN001'
ON CONFLICT (user_id) DO NOTHING;

-- migrate:down
DELETE FROM user_profile WHERE user_id IN (SELECT id FROM users WHERE codigo = 'ADMIN001');
DELETE FROM users WHERE codigo = 'ADMIN001';
