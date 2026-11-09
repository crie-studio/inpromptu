# Assinatura digital com a SignPath Foundation

A SignPath Foundation assina de graça projetos de código aberto. O certificado sai em nome da SignPath
Foundation, e cada versão é gerada pelo GitHub Actions a partir deste repositório e aprovada por você antes de
ser assinada. Enquanto a assinatura não estiver configurada, o build gera o instalador sem assinatura.

## 1. Antes de pedir

- [ ] Repositório público no GitHub, com a licença MIT (`LICENSE`) e a seção **Code signing policy** no README.
- [ ] Verificação em duas etapas ligada na sua conta do GitHub.
- [ ] Pelo menos uma versão publicada (sem assinatura) em *Releases*. A SignPath exige que o projeto já tenha
      sido lançado no formato que será assinado.
- [ ] Em `CODE_SIGNING_POLICY.md`, troque `GITHUB_USER` pelo seu usuário do GitHub.

## 2. Pedir a assinatura

Preencha o formulário em <https://signpath.org/apply> com o link do repositório. A análise é manual e pode
levar alguns dias. Pontos que costumam pesar: projeto ativo, código aberto de verdade (sem partes fechadas),
descrição clara do que o app faz e build reproduzível pelo GitHub Actions — tudo isso o repositório já tem.

## 3. Configurar o projeto na SignPath (depois de aprovado)

1. Ligue a verificação em duas etapas também na conta da SignPath.
2. Em **Trusted Build Systems**, adicione o *GitHub.com* e ligue-o ao projeto.
3. Crie duas configurações de artefato, copiando o conteúdo dos arquivos deste repositório:
   - slug `app` ← [`.signpath/artifact-configurations/app.xml`](../.signpath/artifact-configurations/app.xml)
   - slug `installer` ← [`.signpath/artifact-configurations/installer.xml`](../.signpath/artifact-configurations/installer.xml)
4. Na política de assinatura (ex.: `release-signing`), coloque você como **Approver**: cada versão espera a sua
   aprovação no site da SignPath antes de ser assinada.
5. Crie um token de API para um usuário com permissão de **Submitter** nessa política.

## 4. Ligar a assinatura no GitHub

Em *Settings → Secrets and variables → Actions* do repositório:

| Tipo | Nome | Valor |
| --- | --- | --- |
| Secret | `SIGNPATH_API_TOKEN` | o token de API da SignPath |
| Variable | `SIGNPATH_ORGANIZATION_ID` | o ID da organização na SignPath |
| Variable | `SIGNPATH_PROJECT_SLUG` | o slug do projeto (ex.: `inpromptu`) |
| Variable | `SIGNPATH_SIGNING_POLICY_SLUG` | o slug da política (ex.: `release-signing`) |

Com `SIGNPATH_ORGANIZATION_ID` preenchido, o workflow de release passa a assinar sozinho.

## 5. Lançar uma versão

1. Atualize `version` no `package.json` e escreva a seção da versão no `CHANGELOG.md`.
2. Crie a tag e envie:

   ```bash
   git tag v2.0.1
   git push origin v2.0.1
   ```

3. O GitHub Actions testa, empacota e envia o `InPromptu.exe` para assinar. Aprove na SignPath; depois ele
   gera o instalador e envia de novo — aprove a segunda assinatura.
4. Ao terminar, aparece um **rascunho** em *Releases* com o instalador e o `SHA256SUMS.txt`. Confira e clique
   em *Publish release*.

## Observações

- A reputação no SmartScreen do Windows vem com os downloads. Nas primeiras semanas o aviso ainda pode
  aparecer, mesmo assinado; com o mesmo certificado, a confiança se acumula de uma versão para outra.
- Mudanças de outras pessoas (pull requests) precisam da sua revisão antes de entrar na `main`. Ative a
  proteção da branch em *Settings → Branches*.
