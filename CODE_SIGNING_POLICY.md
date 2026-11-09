# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## What is signed

Only binaries built from this repository are signed: `InPromptu.exe` (the app) and `InPromptu-Setup-<version>.exe`
(the installer). They are built by the GitHub Actions workflow in [`.github/workflows/release.yml`](.github/workflows/release.yml)
from a tagged commit, and each release must be approved manually before it is signed. Third-party files that ship
with the app (Electron/Chromium libraries, `ffmpeg.dll` and others) are not signed with this certificate.

## Team roles

| Role | Members |
| --- | --- |
| Committers and reviewers | [Luiz Felipe Pitzer Jacob](https://github.com/crie-studio) |
| Approvers | [Luiz Felipe Pitzer Jacob](https://github.com/crie-studio) |

Committers may change the source without additional review. Reviewers review every change proposed by
non-committers (pull requests). Approvers approve each signing request. All members use multi-factor
authentication on GitHub and on SignPath.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the
user or the person installing or operating it.

What that means in practice:

- **Voice recognition runs on your computer.** Microphone audio is never sent anywhere.
- **Voice models** are downloaded from [alphacephei.com](https://alphacephei.com/vosk/models) (the Vosk project) only
  when you turn on voice tracking or click to download a language. That download is subject to the policies of
  [alphacephei.com](https://alphacephei.com).
- **Phone remote control** is off by default. When you turn it on, InPromptu opens a server on your local network,
  protected by a random token in the link, so that your phone can show and control the reading.
- **OBS integration** is off by default. When you turn it on, InPromptu connects to the OBS WebSocket server at the
  address you type (usually your own computer).
- There is no telemetry, no analytics and no automatic update check.

## Reporting

If you believe a signed InPromptu binary is malicious or was not built from this repository, open an issue or
contact the maintainer, and report it to SignPath at support@signpath.io.

---

### Resumo em português

A assinatura de código é gratuita, feita pela [SignPath.io](https://about.signpath.io) com certificado da
[SignPath Foundation](https://signpath.org). Só são assinados o `InPromptu.exe` e o instalador, gerados pelo build
automático do GitHub a partir do código deste repositório, e cada versão precisa ser aprovada manualmente antes da
assinatura. O programa não envia nenhuma informação pela rede, a não ser quando você pede: baixar um modelo de voz,
ligar o controle pelo celular (só na sua rede local) ou conectar ao OBS.
