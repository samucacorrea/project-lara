<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/10AVRxqSu8u8_UgCw9EXk_Gsf_EfqPwJI

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Backend PHP (Project Lara)

1. Certifique-se de que o MySQL tenha sido migrado com `backend/migrations/001_create_data_sources_table.sql`.
2. Execute também `backend/migrations/002_create_dashboards_table.sql`, `003_create_reports_table.sql`, `004_create_users_table.sql`, `005_add_owner_to_reports.sql` e `006_create_report_collaborators.sql` para habilitar filtros globais, permissões e links compartilháveis.
3. Preencha as variáveis `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DEBUG_MODE` e `APP_KEY` em [.env.local](.env.local).  
   Para o frontend, configure também `VITE_BACKEND_URL` e `VITE_DEBUG_MODE` (true/false).
4. Suba o servidor embutido do PHP apontando para `backend/public`:

   ```bash
   php -S localhost:8080 -t backend/public
   ```

4. Endpoints disponíveis:
   - `GET /data-sources` – lista todas as fontes salvas
   - `POST /data-sources` – cria uma nova fonte (envie JSON com `name`, `type`, `config`, etc.)
   - `GET /data-sources/{id}` – retorna uma fonte específica
   - `PUT /data-sources/{id}` – atualiza credenciais e metadados
   - `DELETE /data-sources/{id}` – exclui a fonte
   - `GET /data-sources/{id}/tables` – explora as tabelas disponíveis (MySQL)
   - `GET /data-sources/{id}/tables/{table}/columns` – lista colunas para configurar eixos
   - `GET /dashboard-settings` – obtém a conexão global, filtro de data e visibilidade padrão do dashboard
   - `PUT /dashboard-settings` – grava as preferências globais (enviar `data_source_id`, `global_filter`, `date_filter_visible`)
   - `POST /reports` – salva o layout atual (widgets, filtros) e marca o usuário autenticado como proprietário
   - `GET /reports` – lista relatórios onde você é dono ou colaborador
   - `GET /reports/{slug}` – recupera o relatório guardado para exibição pública (link compartilhável)
- `POST /reports/{id}/share` – compartilha o relatório com outro usuário da plataforma (`email`, `permission`)
- `POST /auth/login` / `GET /auth/me` – fluxo de autenticação via token
- `GET/POST/PUT/DELETE /users` – administração de usuários (somente admins)
- `GET/POST/PUT/DELETE /extractors` – gerencia conectores do módulo **Extrator**
- `POST /extractors/{id}/run` – dispara a coleta imediata e registra um job
- `GET /extractors/{id}/jobs` – consulta histórico de execuções de um conector

## Guardar relatórios

- No topo do estúdio, o botão **Guardar** salva a configuração atual (widgets, filtros e fonte global) e devolve um link único.
- O link pode ser compartilhado com `/report/SLUG` e abre o dashboard diretamente em modo preview, mesmo sem login.
- Durante a visualização de um link compartilhado, os controles de edição são bloqueados para evitar alterações acidentais.
- Para compartilhar com usuários internos (e manter edição colaborativa) use o botão **Compartilhar** após guardar e informe o e-mail do usuário já cadastrado.

## Autenticação & papéis

- A migração `004_create_users_table.sql` cria automaticamente um administrador:
  - **E-mail:** `samuel.correa@lvl.com.br`
  - **Senha:** `Dajw5cfp@`
- Papéis disponíveis:
  - `admin`: gerencia usuários, fontes de dados, configurações globais e dashboards;
  - `standard`: cria/edita dashboards e compartilha relatórios;
  - `viewer`: acessa relatórios somente em modo leitura.
- Autentique-se em `/auth/login` para receber o token (JWT). O frontend guarda o token na sessão e injeta `Authorization: Bearer <token>` automaticamente em todas as requisições protegidas.

## Debug Mode

- Ative `DEBUG_MODE=true` (backend) para receber payloads detalhados no JSON de erro.
- Com `VITE_DEBUG_MODE=true` o frontend exibe um painel flutuante de notificações (erros, sucesso, logs) que ajuda a copiar mensagens e compartilhar aqui no suporte.

## Filtros & Conexões Globais

- No topo do dashboard selecione a **Conexão Global** (MySQL, Sheets etc.) que alimentará todos os widgets. As propriedades de cada componente passam a escolher apenas tabelas/colunas dessa fonte.
- O filtro de data global oferece presets rápidos (Hoje, Ontem, Últimos 7/15/30 dias) e intervalo personalizado. Ele pode ser ocultado visualmente, mas continua aplicado em todos os gráficos.
- Widgets do tipo filtro atualizam o `dimensionFilter` global, sincronizando headlines e gráficos automaticamente.

## Módulo Extrator

- Cadastre integrações em `/extractors` informando `provider`, `auth_type`, configuração (tokens/OAuth) e a `target_table` onde os dados serão armazenados.
- Os provedores suportados inicialmente são `google_ads`, `google_analytics`, `microsoft_clarity`, `meta_ads`, `meta_organic`, `tiktok_ads` e `custom`.
- Cada execução (`POST /extractors/{id}/run`) gera um job em `extractor_jobs`, cria automaticamente a tabela de destino (colunas genéricas `payload JSON`) e persiste o lote retornado.
- Use `GET /extractors/{id}/jobs` para acompanhar o histórico e `extractor_job(s)` nos logs para depuração.

## Testes Backend

Execute o script de smoke test (usa transações, portanto não deixa dados) para validar o repositório de fontes:

```bash
php backend/tests/DataSourceRepositoryTest.php
```
