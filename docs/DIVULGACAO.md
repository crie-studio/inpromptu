# Divulgação e buscadores

Tudo o que depende de uma conta sua, com os textos prontos para colar. O site já tem título e descrição para
busca, dados estruturados, perguntas frequentes, imagem de compartilhamento, versão em inglês, `sitemap.xml` e
`llms.txt`.

Endereços:

- Página (português): <https://crie-studio.github.io/inpromptu/>
- Página (inglês): <https://crie-studio.github.io/inpromptu/en/>
- Versão web: <https://crie-studio.github.io/inpromptu/app/>
- Download para Windows: <https://github.com/crie-studio/inpromptu/releases/latest>
- Código: <https://github.com/crie-studio/inpromptu>

## 1. Google Search Console

A tag de verificação já está na página inicial.

1. Em <https://search.google.com/search-console>, na propriedade `https://crie-studio.github.io/inpromptu/`
   (prefixo de URL), clique em **Verificar** (método "Tag HTML").
2. Em **Sitemaps**, envie `sitemap.xml`.
3. Em **Inspeção de URL**, peça a indexação de `https://crie-studio.github.io/inpromptu/` e de `…/en/`.

## 2. Bing Webmaster Tools (é o índice que alimenta o Copilot e parte do ChatGPT)

1. Em <https://www.bing.com/webmasters>, escolha **Importar do Google Search Console**: o site e o sitemap vêm
   juntos, sem nova verificação.
2. Se preferir verificar por arquivo, o Bing entrega um `BingSiteAuth.xml`: coloque-o em `web/public/` e
   publique (tudo o que está nessa pasta vai para a raiz do site).

## 3. AlternativeTo (aparece muito em respostas do tipo "alternativas a X")

<https://alternativeto.net/software/new/>

- **Name:** InPromptu
- **Short description:** Free, open-source teleprompter that follows your voice offline, for Windows and the web.
- **Description:** InPromptu highlights each word as you speak and scrolls at your pace, using offline speech
  recognition guided by your script. It stops when you stop, finds you again if you skip a sentence, and runs
  entirely on your computer. It integrates with OBS Studio (records with the reading, switches scenes, adds
  chapters), writes .srt subtitles, mirrors the text for beam-splitter teleprompters, supports a second screen
  and can be controlled from a phone. Interface in Portuguese.
- **Platforms:** Windows, Online/Web, Self-Hosted
- **License:** Free, Open Source (MIT)
- **Tags:** teleprompter, speech-recognition, voice-control, obs-studio, video-recording, autocue
- **Alternative to:** PromptSmart, Teleprompter Premium, Teleprompter.com, Speakflow, Textream, QPrompt,
  Imaginary Teleprompter

## 4. Product Hunt

- **Name:** InPromptu
- **Tagline (60):** The free teleprompter that follows your voice, offline
- **Description (260):** Read to the camera while InPromptu highlights each word and scrolls at your pace. Speech
  recognition runs on your computer, guided by your script. Works with OBS, writes .srt subtitles, mirrors for
  teleprompter glass and has a phone remote. Windows app and web version.
- **Topics:** Productivity, Video, Open Source, Content creators
- **Primeiro comentário:**

  > Hi! I built InPromptu because voice-following teleprompters were either paid, online-only or missing on
  > Windows. It runs Vosk (WebAssembly) guided by the words in your script, a Silero voice detector, and an
  > alignment step that tolerates skipped and swapped words, so it keeps up even when you improvise a bit.
  > It's MIT-licensed and the voice never leaves your machine. The UI is in Portuguese for now; feedback welcome!

## 5. Hacker News (Show HN)

- **Title:** Show HN: InPromptu – a teleprompter that follows your voice, offline (Windows and web)
- **URL:** https://github.com/crie-studio/inpromptu
- **Text:**

  > InPromptu is an MIT-licensed teleprompter that tracks your reading word by word. Speech recognition is Vosk
  > compiled to WebAssembly, restricted to the script's vocabulary (a grammar), which makes it accurate on names
  > and fast (~0.5 s). Each recognized phrase is aligned against the script with a small dynamic-programming
  > matcher, a Silero VAD tells speech from noise, and a position/pace estimator moves the text smoothly between
  > recognitions. The same UI runs as an Electron app and as a web app (a small bridge replaces Electron's IPC).
  > It also drives OBS over obs-websocket and writes .srt subtitles from the word timings.

## 6. Reddit

Veja as regras de autopromoção de cada comunidade antes de postar.

**r/obs, r/youtubers, r/NewTubers** (em inglês, com um vídeo curto ou GIF):

> **I made a free teleprompter that follows your voice and controls OBS**
>
> It highlights each word as you speak and scrolls at your pace (offline speech recognition, nothing sent to
> any server). With OBS connected it starts/stops recording with the reading, switches scenes when the script
> says `[cena: Close]` and adds chapters. It also writes .srt subtitles from your read. Windows app or web
> version, MIT-licensed: https://crie-studio.github.io/inpromptu/en/

**r/brdev, r/brasil (flair de tecnologia)** (em português):

> **Fiz um teleprompter grátis que acompanha a voz, offline, para Windows e navegador**
>
> O reconhecimento roda no seu computador (Vosk em WebAssembly, guiado pelas palavras do roteiro), o texto sobe
> no seu ritmo e para quando você para. Conversa com o OBS, gera legendas .srt e dá para controlar pelo celular.
> Código aberto (MIT): https://github.com/crie-studio/inpromptu

## 7. YouTube (vídeo de 1 a 2 minutos)

- **Título:** Teleprompter GRÁTIS que acompanha a sua voz (Windows e navegador) | InPromptu
- **Descrição:**

  > O InPromptu é um teleprompter grátis e de código aberto que destaca cada palavra enquanto você fala e sobe o
  > texto no seu ritmo, sem internet. Funciona com o OBS, gera legendas .srt e dá para controlar pelo celular.
  >
  > Baixar para Windows: https://github.com/crie-studio/inpromptu/releases/latest
  > Usar no navegador: https://crie-studio.github.io/inpromptu/app/
  > Página: https://crie-studio.github.io/inpromptu/
  >
  > 0:00 O que é
  > 0:15 Lendo com a voz
  > 0:45 OBS: cenas e capítulos pelo roteiro
  > 1:10 Controle pelo celular
  > 1:30 Legendas prontas

- **Tags:** teleprompter, teleprompter grátis, teleprompter online, teleprompter para pc, teleprompter obs,
  como gravar vídeo olhando para a câmera, InPromptu

## 8. LinkedIn

> Lancei o InPromptu: um teleprompter grátis e de código aberto que acompanha a sua voz.
>
> Você lê olhando para a câmera e ele destaca cada palavra, sobe o texto no seu ritmo e para quando você para.
> O reconhecimento de voz roda no próprio computador, sem internet. Ele também grava junto com o OBS, troca de
> cena pelo roteiro, gera legendas e pode ser controlado pelo celular.
>
> Para Windows e direto no navegador: https://crie-studio.github.io/inpromptu/

## 9. Artigo de bastidores (Dev.to, Medium ou LinkedIn)

Título sugerido: **"Como fiz um teleprompter que entende a voz, offline, no navegador"**

1. O problema: rolagem por volume não sabe onde você está no texto.
2. Reconhecimento guiado: o Vosk só procura as palavras do roteiro (gramática), e por isso acerta nomes.
3. Alinhamento: a frase ouvida contra o roteiro, com palavras esquecidas, trocadas e a mais.
4. Detector de voz (Silero) e o estimador de posição e ritmo: por que o texto não "pula".
5. Um app, duas plataformas: Electron e web com a mesma interface, trocando só a "ponte".
6. Medindo de verdade: amostras de voz gravadas e comparação quadro a quadro.

## 10. winget (catálogo de programas do Windows)

A forma mais simples é a ferramenta oficial, que lê o instalador e gera os arquivos:

```bash
winget install wingetcreate
```

```bash
wingetcreate new https://github.com/crie-studio/inpromptu/releases/download/v2.0.1/InPromptu-Setup-2.0.1.exe
```

Ela pergunta os dados e abre o pedido (pull request) no repositório `microsoft/winget-pkgs` com a sua conta do
GitHub. Os arquivos já preenchidos para conferir estão em [`docs/winget/`](winget/).
