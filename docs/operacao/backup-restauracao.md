# Cópia de segurança e restauração: área dos advogados

Este guia faz parte da preparação T16 (`preparacao-financeiro-docx.md`).
Estado em 09/10/2026: **nada disto está configurado**. A tela
**Operação e LGPD** mostra "Última cópia boa: Nenhuma" até a rotina existir.

## O que já existe e o que não existe

| | Plano gratuito (piloto, hoje) | Supabase Pro (US$ 25/mês) |
|---|---|---|
| Cópia do banco feita pelo Supabase | **Não há** | Diária, guardada por 7 dias, restaurável pelo painel |
| Restaurar para um minuto exato (PITR) | Não há | Complemento pago, a partir de cerca de US$ 100/mês |
| Arquivos do balde `anexos` | Não entram em cópia nenhuma | Também não entram na cópia diária |

No plano gratuito, a única cópia é a que o próprio escritório fizer. Por isso
existe a tabela `backups_execucoes`: cada execução da rotina registra quando
rodou, o tamanho, o hash e o destino. A tela de Operação calcula a idade da
última cópia boa.

## Recomendação: decidir com o Vinícius

- **RPO (quanto se aceita perder):** 24 horas.
- **RTO (quanto tempo para voltar):** 4 horas.

A rotina abaixo cumpre os dois no plano gratuito.

**Destino** (a confirmar): um armazenamento fora do Supabase. Pode ser o
Google Drive do escritório ou um bucket S3/R2. Os arquivos vão
**criptografados**: a cópia tem CPF, endereço e dados financeiros de clientes
(LGPD, art. 46).

## Rotina diária sugerida (GitHub Actions)

Esta rotina **não está no repositório**, de propósito: um workflow agendado
sem os segredos configurados falharia todo dia. Para ativar:

1. **Secrets no GitHub** (Settings → Secrets and variables → Actions):
   - `SUPABASE_DB_URL`: a *connection string* do banco (Supabase → Project
     Settings → Database → Connection string → URI, modo *Session*). Contém a
     senha do banco.
   - `BACKUP_SENHA`: frase longa para criptografar a cópia. Guarde-a também
     fora do GitHub; sem ela, a cópia não se abre.
   - `SUPABASE_URL` e `SUPABASE_SECRET_KEY`: para registrar a execução em
     `backups_execucoes`, com a chave secreta (`sb_secret_…`).
2. Criar `.github/workflows/copia-diaria.yml`:

```yaml
name: Cópia diária do banco
on:
  schedule:
    - cron: '30 6 * * *'   # 03:30 em Brasília
  workflow_dispatch:
jobs:
  copia:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Instalar o cliente do Postgres 17
        run: |
          sudo install -d /usr/share/postgresql-common/pgdg
          sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
          echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
          sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client-17
      - name: Copiar, criptografar e registrar
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
          BACKUP_SENHA: ${{ secrets.BACKUP_SENHA }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
        run: |
          set -euo pipefail
          inicio=$(date -u +%Y-%m-%dT%H:%M:%SZ)
          registrar() {
            curl -s -X POST "$SUPABASE_URL/rest/v1/backups_execucoes" \
              -H "apikey: $SUPABASE_SECRET_KEY" -H "Content-Type: application/json" \
              -d "$1" > /dev/null
          }
          trap 'registrar "{\"iniciado_em\":\"$inicio\",\"situacao\":\"falhou\",\"destino\":\"github-actions\",\"detalhe\":\"falhou no passo de cópia\"}"' ERR
          pg_dump "$SUPABASE_DB_URL" --schema=public --schema=privado --schema=auth \
            --no-owner --no-privileges --format=custom --file=fhl.dump
          gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_SENHA" \
            --symmetric --cipher-algo AES256 --output fhl.dump.gpg fhl.dump
          tamanho=$(stat -c %s fhl.dump.gpg)
          hash=$(sha256sum fhl.dump.gpg | cut -d' ' -f1)
          echo "tamanho=$tamanho hash=$hash"
          registrar "{\"iniciado_em\":\"$inicio\",\"concluido_em\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"situacao\":\"ok\",\"tamanho_bytes\":$tamanho,\"sha256\":\"$hash\",\"arquivos\":1,\"destino\":\"github-actions (artefato, 30 dias)\"}"
      - uses: actions/upload-artifact@v4
        with:
          name: copia-${{ github.run_id }}
          path: fhl.dump.gpg
          retention-days: 30
```

O artefato do GitHub fica **30 dias**. Para guardar por mais tempo (o
Financeiro pede 5 anos para documentos fiscais), acrescente um passo que envie
`fhl.dump.gpg` ao destino escolhido.

**Cota gratuita:** o GitHub Actions dá 2.000 minutos por mês em repositório
privado, e esta rotina usa uns 2 minutos por dia. O armazenamento de
artefatos (500 MB no gratuito) comporta muitas cópias de um banco deste
tamanho.

### Anexos (balde privado `anexos`)

`pg_dump` não copia arquivos do Storage. Duas saídas:

1. **Mensal e manual, no início:** baixar o balde pelo painel do Supabase, ou
   com `supabase storage cp -r ss:///anexos ./anexos --experimental`, e
   guardar criptografado junto com a cópia do banco.
2. **Automática:** um passo a mais no workflow que lista
   `storage.objects` do balde `anexos` com a chave secreta e baixa os objetos
   novos desde a última execução.

## Restauração

Ensaie **antes** de precisar, num projeto Supabase de teste e nunca no de
produção:

```bash
gpg --decrypt fhl.dump.gpg > fhl.dump
```

```bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "$URL_DO_PROJETO_DE_TESTE" fhl.dump
```

Depois de restaurar:

1. Confira a contagem de linhas de `contratos`, `parcelas`, `recebimentos`,
   `contas` e `pagamentos_despesa` contra a tela de Fechamento do último mês
   fechado. O "retrato" gravado no fechamento precisa bater.
2. Abra o sistema apontando para o projeto restaurado (`config.js` local) e
   confira um contrato e um mês fechado.
3. Registre o ensaio. A data do último ensaio entra como evidência na
   revisão da LGPD.

O ensaio que já roda localmente sem rede é `npm run banco:test`. Ele aplica
as migrações sobre um banco com os dados antigos e confere que nada mudou
(`supabase/testes/migracao/`). Não substitui a restauração de uma cópia de
verdade.
