// Interface em inglês: texto em português (como aparece nas telas) → inglês.
// As chaves são o texto com os espaços normalizados; em textos com marcação no meio
// (<b>, <small>, <kbd>…), a chave é o HTML do elemento. Os padrões cobrem os textos
// montados pelos scripts com números e nomes no meio (sem a flag g).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.InPromptuI18nEn = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const text = {
    /* ── Títulos e nomes ── */
    'InPromptu - por Luiz Felipe Pitzer': 'InPromptu - by Luiz Felipe Pitzer',
    'InPromptu': 'InPromptu',
    'InPromptu — Teleprompter': 'InPromptu — Teleprompter',
    'InPromptu — Controle': 'InPromptu — Remote',
    'InPromptu — Segunda tela': 'InPromptu — Second screen',
    'Teleprompter': 'Teleprompter',
    'Motor de voz': 'Voice engine',
    'LF': 'LF',
    'LFP': 'LFP',
    'Luiz Felipe Pitzer': 'Luiz Felipe Pitzer',
    'lfp.app.br ↗': 'lfp.app.br ↗',
    'lfp.app.br': 'lfp.app.br',
    'https://lfp.app.br': 'https://lfp.app.br',
    'Abrir https://lfp.app.br': 'Open https://lfp.app.br',
    'OBS Studio': 'OBS Studio',

    /* ── Editor: barra de cima ── */
    'Novo (Ctrl+N)': 'New (Ctrl+N)',
    'Novo': 'New',
    'Abrir .inpromptu, .txt, .md ou .pptx (Ctrl+O)': 'Open .inpromptu, .txt, .md or .pptx (Ctrl+O)',
    'Abrir': 'Open',
    'Salvar (Ctrl+S)': 'Save (Ctrl+S)',
    'Salvar': 'Save',
    'Sem título': 'Untitled',
    'Modo de guia': 'Guide mode',
    'Voz': 'Voice',
    'Clássico': 'Classic',
    'Ativado por voz': 'Voice-activated',
    'Onde o texto aparece': 'Where the text appears',
    'Ilha': 'Island',
    'Flutuante': 'Floating',
    'Tela cheia': 'Full screen',
    'Configurações': 'Settings',
    'Iniciar / parar (Ctrl+Enter · global: Ctrl+Alt+P)': 'Start / stop (Ctrl+Enter · global: Ctrl+Alt+P)',
    'Iniciar': 'Start',
    'Parar': 'Stop',
    'Páginas': 'Pages',
    'Nova página': 'New page',
    'Arraste um <b>.pptx</b> para importar as anotações do apresentador como páginas.': 'Drop a <b>.pptx</b> here to import the speaker notes as pages.',
    'Solte para abrir': 'Drop to open',
    'Mover para cima': 'Move up',
    'Mover para baixo': 'Move down',
    'Excluir página': 'Delete page',
    'Excluir a página {n}?': 'Delete page {n}?',
    'Há alterações não salvas. Continuar mesmo assim?': 'There are unsaved changes. Continue anyway?',
    'Cole ou escreva seu roteiro aqui… Dicas: [olhe para a câmera] — entre colchetes: nota de direção, que não é lida [cena: Câmera 2] — troca de cena no OBS quando a leitura chegar aqui # Introdução — linha começando com #: seção (teclas 1 a 9 pulam para ela)':
      'Paste or write your script here…\n\nTips:\n[look at the camera] — in brackets: a stage note, which isn\'t read\n[scene: Camera 2] — switches the OBS scene when the reading gets here\n# Introduction — a line starting with #: a section (keys 1 to 9 jump to it)',

    /* ── Editor: abas ── */
    'Leitura': 'Reading',
    'Janela': 'Window',
    'Visual': 'Display',
    'Conexões': 'Connections',
    'Mais': 'More',

    /* ── Leitura ── */
    'Rastreamento de voz': 'Voice tracking',
    'Acompanha o roteiro enquanto você lê: o texto sobe no seu ritmo e para quando você para. Usa o microfone, 100% offline.':
      'Follows the script as you read: the text moves at your pace and stops when you stop. Uses the microphone, 100% offline.',
    'Rola em velocidade constante. Não usa o microfone.': 'Scrolls at a constant speed. Doesn\'t use the microphone.',
    'Rola na velocidade escolhida enquanto você fala e para no silêncio. Bom para improvisar fora do roteiro.':
      'Scrolls at the chosen speed while you speak and stops when you go quiet. Good for improvising off-script.',
    'Idioma da fala': 'Speech language',
    'Baixar': 'Download',
    'Microfone': 'Microphone',
    'Velocidade': 'Speed',
    'Palavras por segundo. Role o mouse sobre o texto para adiantar ou voltar.': 'Words per second. Scroll the mouse over the text to move forward or back.',
    'Sensibilidade do detector de voz': 'Voice detector sensitivity',
    'O detector distingue voz de ruído e decide quando o texto anda. Se ele andar com outras vozes ou barulho, diminua; se não andar quando você fala baixo, aumente. As ondinhas na barra ficam coloridas quando ele ouve você.':
      'The detector tells your voice apart from noise and decides when the text moves. If it moves with other voices or noise, turn it down; if it doesn\'t move when you speak softly, turn it up. The little waves in the bar light up when it hears you.',
    'Avançar para a próxima página automaticamente': 'Go to the next page automatically',
    'Antes e durante a leitura': 'Before and during reading',
    'Contagem antes de começar': 'Countdown before starting',
    'Não': 'No',
    '3 s': '3 s',
    '5 s': '5 s',
    'Mostrar cronômetro e tempo restante <small>O tempo restante usa o seu ritmo de leitura.</small>':
      'Show timer and time left <small>Time left is based on your reading pace.</small>',
    'Meta de duração (min; 0 = sem meta)': 'Target duration (min; 0 = no target)',
    'Legendas': 'Subtitles',
    'Gerar legendas .srt ao terminar <small>No rastreamento de voz, com o instante em que cada palavra foi dita. Se o OBS gravou, ficam ao lado do vídeo e com o mesmo nome; senão, em Documentos\\InPromptu\\Legendas.</small>':
      'Create .srt subtitles when finished <small>In voice tracking, with the moment each word was spoken. If OBS recorded, they go next to the video, with the same name; otherwise, to Documents\\InPromptu\\Subtitles.</small>',
    'Abrir pasta das legendas': 'Open subtitles folder',
    'Mostrar a última': 'Show the latest',
    'Amostra de voz': 'Voice sample',
    'Grave 1 a 2 minutos lendo em voz alta o roteiro aberto aqui no editor, no seu ritmo normal. A gravação fica só no seu computador e serve para ajustar o reconhecimento à sua voz.':
      'Record 1 to 2 minutes reading the script open here in the editor aloud, at your normal pace. The recording stays on your computer and is used to tune recognition to your voice.',
    '● Gravar amostra': '● Record sample',
    'Abrir pasta das gravações': 'Open recordings folder',

    /* ── Janela ── */
    'Ilha no topo': 'Island at the top',
    'Fica colada no topo da tela, logo abaixo da webcam — seus olhos parecem olhar para a câmera.':
      'Sits at the top of the screen, right below the webcam — your eyes seem to look at the camera.',
    'Janela flutuante': 'Floating window',
    'Sempre visível por cima dos outros apps. Arraste pela barra inferior.': 'Always on top of other apps. Drag it by the bottom bar.',
    'Teleprompter em tela cheia em qualquer monitor (ideal para monitor externo ou espelho). Esc para sair.':
      'Full-screen teleprompter on any monitor (ideal for an external monitor or a mirror). Esc to exit.',
    'Acompanhar o monitor onde está o mouse': 'Follow the monitor where the mouse is',
    'Monitor': 'Monitor',
    'Seguir o cursor <small>(a janela fica transparente a cliques; use os atalhos)</small>':
      'Follow the cursor <small>(clicks pass through the window; use the shortcuts)</small>',
    'Efeito vidro (acrílico do Windows 11)': 'Glass effect (Windows 11 acrylic)',
    'Escurecer o fundo': 'Darken the background',
    'Monitor, layout do texto, transparência e câmera: aba <b>Tela cheia</b>.': 'Monitor, text layout, transparency and camera: <b>Full screen</b> tab.',
    'Privacidade': 'Privacy',
    'Esconder de gravações e compartilhamento de tela <small>(Teams, Zoom, Meet, OBS…)</small>':
      'Hide from recordings and screen sharing <small>(Teams, Zoom, Meet, OBS…)</small>',
    'Monitor principal': 'Main monitor',
    'Monitor onde está o mouse': 'Monitor with the mouse',
    'Outro monitor (automático)': 'Other monitor (automatic)',

    /* ── Visual ── */
    'Largura': 'Width',
    'Altura do texto': 'Text height',
    'Fonte': 'Font',
    'Sans': 'Sans',
    'Serif': 'Serif',
    'Mono': 'Mono',
    'Dislexia': 'Dyslexia',
    'Tamanho': 'Size',
    'PP': 'XS',
    'P': 'S',
    'M': 'M',
    'G': 'L',
    'GG': 'XL',
    'Cor do destaque': 'Highlight color',
    'Branco': 'White',
    'Amarelo': 'Yellow',
    'Verde': 'Green',
    'Azul': 'Blue',
    'Rosa': 'Pink',
    'Laranja': 'Orange',

    /* ── Tela cheia ── */
    'Estas opções valem para o modo Tela cheia.': 'These options apply to Full screen mode.',
    'Usar tela cheia': 'Use full screen',
    'Espelhar (para teleprompter com vidro)': 'Mirror (for a teleprompter with glass)',
    'Horizontal': 'Horizontal',
    'Vertical': 'Vertical',
    'Ambos': 'Both',
    'Girar (monitor em pé)': 'Rotate (portrait monitor)',
    'Texto': 'Text',
    'Alinhamento': 'Alignment',
    'Esquerda': 'Left',
    'Centro': 'Center',
    'Justificado': 'Justified',
    'Largura da coluna': 'Column width',
    'Coluna estreita e centralizada: os olhos andam menos e você parece olhar para a câmera.':
      'A narrow, centered column: your eyes move less and you seem to look at the camera.',
    'Espaço entre linhas': 'Line spacing',
    'Espaço entre letras': 'Letter spacing',
    'Peso': 'Weight',
    'Normal': 'Normal',
    'Médio': 'Medium',
    'Negrito': 'Bold',
    'TUDO EM MAIÚSCULAS': 'ALL CAPS',
    'Cor do texto': 'Text color',
    'Contorno do texto': 'Text outline',
    'Ajuda a ler sobre a câmera ou sobre outros programas.': 'Helps when reading over the camera or other programs.',
    'Linha de leitura': 'Reading line',
    'Posição': 'Position',
    'Marcador': 'Marker',
    'Nenhum': 'None',
    'Nenhuma': 'None',
    'Seta': 'Arrow',
    'Faixa': 'Band',
    'Fundo e transparência': 'Background and transparency',
    'Fundo': 'Background',
    'Cor do fundo': 'Background color',
    'Opacidade do fundo': 'Background opacity',
    'Abaixo de 100% você vê o que está atrás — por exemplo, o projetor ou a prévia do OBS.':
      'Below 100% you can see what\'s behind it — for example, the projector or the OBS preview.',
    'Cliques atravessam para o programa de baixo <small>A barra de controles continua clicável. Liga/desliga a qualquer momento com <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd>.</small>':
      'Clicks pass through to the program below <small>The control bar stays clickable. Turn it on or off at any time with <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd>.</small>',
    'Mostrar a barra de controles <small>Desligado, ela aparece quando o mouse passa por ela.</small>':
      'Show the control bar <small>When off, it appears when the mouse passes over it.</small>',
    'Câmera': 'Camera',
    'Mostrar câmera': 'Show camera',
    'Para se ver com a cena e os filtros do OBS: no OBS, clique em <b>Iniciar câmera virtual</b> e escolha <b>OBS Virtual Camera</b> aqui.':
      'To see yourself with the OBS scene and filters: in OBS, click <b>Start Virtual Camera</b> and choose <b>OBS Virtual Camera</b> here.',
    'Onde': 'Where',
    'Fundo da tela': 'Screen background',
    'Janelinha no canto': 'Small window in the corner',
    'Escurecer a câmera': 'Darken the camera',
    'Espelhar a câmera (como selfie)': 'Mirror the camera (like a selfie)',
    'Segunda tela (para quem apresenta)': 'Second screen (for the presenter)',
    'Mostrar também em outro monitor <small>Uma tela cheia extra que acompanha a leitura, com este mesmo layout — por exemplo, o monitor do vidro do teleprompter. Funciona com qualquer tipo de janela (ilha, flutuante ou tela cheia).</small>':
      'Also show on another monitor <small>An extra full screen that follows the reading, with this same layout — for example, the teleprompter glass monitor. Works with any window type (island, floating or full screen).</small>',
    'Espelhar': 'Mirror',
    'Padrão do Windows': 'Windows default',
    'Câmera desconectada': 'Camera disconnected',

    /* ── Conexões ── */
    'Celular (rede local)': 'Phone (local network)',
    'Celular': 'Phone',
    'Acompanhe e controle a leitura pelo celular ou tablet, sem instalar nada. O celular mostra o texto e tem todos os controles: pausar, linhas, páginas, seções, velocidade e microfone. A aba <b>Enviar texto</b> permite escrever e mandar um roteiro.':
      'Follow and control the reading from your phone or tablet, with nothing to install. The phone shows the text and has every control: pause, lines, pages, sections, speed and microphone. The <b>Send text</b> tab lets you write and send a script.',
    'Ativar conexão remota': 'Enable remote connection',
    'Porta': 'Port',
    'QR code da conexão remota': 'Remote connection QR code',
    'Copiar link': 'Copy link',
    'Gerar novo link': 'Create new link',
    'O celular precisa estar na mesma rede Wi-Fi. Na primeira vez, o Windows pode pedir para liberar o app no firewall (marque <b>Redes privadas</b>). O tráfego não é criptografado — use só em redes confiáveis.':
      'The phone must be on the same Wi-Fi network. The first time, Windows may ask you to allow the app through the firewall (check <b>Private networks</b>). Traffic is not encrypted — use it only on trusted networks.',
    'Nenhum dispositivo conectado': 'No devices connected',
    'Link copiado.': 'Link copied.',
    'Novo link gerado — o anterior deixou de funcionar.': 'New link created — the old one no longer works.',
    'Grava no OBS junto com a leitura, troca de cena quando a leitura passa por <code>[cena: Nome da cena]</code> no roteiro e marca capítulos. No OBS: <b>Ferramentas → Configurações do servidor WebSocket</b> → marque <b>Ativar servidor WebSocket</b>; a senha aparece em <b>Mostrar informações de conexão</b>.':
      'Records in OBS along with the reading, switches scenes when the reading passes <code>[scene: Scene name]</code> in the script, and marks chapters. In OBS: <b>Tools → WebSocket Server Settings</b> → check <b>Enable WebSocket server</b>; the password is under <b>Show Connect Info</b>.',
    'Conectar ao OBS': 'Connect to OBS',
    'Endereço': 'Address',
    'Senha do servidor WebSocket': 'WebSocket server password',
    'digite e clique em Salvar': 'type it and click Save',
    'Conectar de novo': 'Reconnect',
    'Começar a gravar com a leitura e parar no fim <small>Se o OBS já estiver gravando, ele continua e o InPromptu não para a gravação.</small>':
      'Start recording with the reading and stop at the end <small>If OBS is already recording, it keeps going and InPromptu doesn\'t stop the recording.</small>',
    'Marcar um capítulo a cada página <small>Precisa do OBS 30.2 ou mais novo, gravando em MP4 híbrido.</small>':
      'Mark a chapter on every page <small>Requires OBS 30.2 or newer, recording to Hybrid MP4.</small>',
    'Desligado.': 'Off.',
    'Conectando…': 'Connecting…',
    'Conectado.': 'Connected.',
    'Não conectado.': 'Not connected.',
    'Senha salva (cifrada pelo Windows).': 'Password saved (encrypted by Windows).',
    'Não deu para guardar a senha com segurança neste computador.': 'Couldn\'t store the password securely on this computer.',
    'Há uma senha salva.': 'A password is saved.',
    'Senha do OBS incorreta.': 'Wrong OBS password.',
    'OBS fechado ou servidor WebSocket desligado. Tentando de novo…': 'OBS is closed or its WebSocket server is off. Trying again…',
    'O OBS pede senha: informe a senha do servidor WebSocket.': 'OBS asks for a password: enter the WebSocket server password.',
    'Endereço do OBS inválido.': 'Invalid OBS address.',
    'o OBS não está conectado': 'OBS is not connected',
    'o OBS não respondeu': 'OBS did not respond',

    /* ── Mais ── */
    'Idioma': 'Language',
    'Idioma da interface': 'Interface language',
    'Automático (o do sistema)': 'Automatic (system language)',
    'Português': 'Português',
    'English': 'English',
    'Atalhos globais': 'Global shortcuts',
    'Atalhos': 'Shortcuts',
    'Funcionam mesmo com outro app em primeiro plano.': 'They work even with another app in front.',
    'Na sobreposição': 'On the teleprompter',
    'Clique numa palavra': 'Click a word',
    'Continuar a partir dela': 'Continue from there',
    'Rolar o mouse': 'Scroll the mouse',
    'Adiantar / voltar linhas': 'Move lines forward / back',
    '<kbd>1</kbd> a <kbd>9</kbd>': '<kbd>1</kbd> to <kbd>9</kbd>',
    'Pular para a seção (linhas com #) — janela flutuante e tela cheia': 'Jump to a section (lines starting with #) — floating window and full screen',
    'Esc': 'Esc',
    'Parar (tela cheia)': 'Stop (full screen)',
    'No editor': 'In the editor',
    'Iniciar / parar': 'Start / stop',
    'Espaço': 'Space',
    'Indisponível: outro programa já usa este atalho.': 'Unavailable: another program already uses this shortcut.',
    'Iniciar / pausar / retomar': 'Start / pause / resume',
    'Ligar / desligar microfone': 'Microphone on / off',
    'Ler o texto copiado (área de transferência)': 'Read the copied text (clipboard)',
    'Tela cheia: cliques atravessam para o app de baixo (liga/desliga)': 'Full screen: clicks pass through to the app below (on/off)',
    'Sobre': 'About',
    'Criado e desenvolvido por': 'Created and developed by',
    'O teleprompter que acompanha a sua voz. Gratuito e de código aberto (licença MIT).':
      'The teleprompter that follows your voice. Free and open source (MIT license).',
    'O reconhecimento de voz roda no seu computador com o <a href="#" data-href="https://alphacephei.com/vosk/">Vosk</a> (Apache 2.0). Nenhum áudio sai da sua máquina. O modelo de cada idioma é baixado uma única vez.':
      'Speech recognition runs on your computer with <a href="#" data-href="https://alphacephei.com/vosk/">Vosk</a> (Apache 2.0). No audio leaves your machine. Each language\'s model is downloaded only once.',
    'Formatos: <b>.inpromptu</b> (páginas; também abre os antigos <b>.roteiro</b>), <b>.txt</b>/<b>.md</b> (separe páginas com uma linha <code>---</code>) e <b>.pptx</b> (anotações do apresentador).':
      'Formats: <b>.inpromptu</b> (pages; also opens the older <b>.roteiro</b> files), <b>.txt</b>/<b>.md</b> (separate pages with a <code>---</code> line) and <b>.pptx</b> (speaker notes).',
    'No texto: <code>[nota]</code> entre colchetes aparece em outra cor e não é lida; <code>[cena: Nome]</code> troca de cena no OBS e <code>[capítulo: Nome]</code> marca um capítulo quando a leitura passa por ali; uma linha começando com <code>#</code> vira uma seção, para pular direto com as teclas 1 a 9 ou pelo celular.':
      'In the text: a <code>[note]</code> in brackets shows in another color and isn\'t read; <code>[scene: Name]</code> switches the OBS scene and <code>[chapter: Name]</code> marks a chapter when the reading gets there; a line starting with <code>#</code> becomes a section you can jump to with keys 1 to 9 or from the phone.',
    'Créditos: Vosk e vosk-browser (Apache 2.0), Silero VAD e ONNX Runtime (MIT), fonte OpenDyslexic (SIL OFL). A ideia da faixa no topo da tela, perto da câmera, veio do <a href="#" data-href="https://github.com/f/textream">Textream</a>, de Fatih Kadir Akın.':
      'Credits: Vosk and vosk-browser (Apache 2.0), Silero VAD and ONNX Runtime (MIT), OpenDyslexic font (SIL OFL). The idea of the band at the top of the screen, near the camera, came from <a href="#" data-href="https://github.com/f/textream">Textream</a>, by Fatih Kadir Akın.',

    /* ── Editor: avisos e estados ── */
    'Roteiro salvo.': 'Script saved.',
    'Termine a gravação da amostra antes de iniciar a leitura.': 'Finish recording the sample before you start reading.',
    'Gravando… leia o roteiro em voz alta, no seu ritmo normal.': 'Recording… read the script aloud, at your normal pace.',
    'Salvando…': 'Saving…',
    'Pare a leitura antes de gravar a amostra.': 'Stop reading before recording the sample.',
    'Amostra de voz salva. Obrigado!': 'Voice sample saved. Thank you!',
    'Nenhum áudio foi gravado.': 'No audio was recorded.',
    'Legendas salvas ao lado do vídeo do OBS.': 'Subtitles saved next to the OBS video.',
    'Legendas salvas em Documentos\\InPromptu\\Legendas.': 'Subtitles saved to Documents\\InPromptu\\Subtitles.',
    'Carregando o modelo de voz…': 'Loading the voice model…',
    'Não foi possível usar o microfone.': 'Couldn\'t use the microphone.',
    'Abrir configurações de privacidade': 'Open privacy settings',
    'Microfone ativo': 'Microphone on',
    'Preparando o modelo…': 'Preparing the model…',
    '✓ Modelo de voz instalado (offline)': '✓ Voice model installed (offline)',
    'Modelo de voz não instalado.': 'Voice model not installed.',
    'Modelo de voz instalado.': 'Voice model installed.',
    'Arquivo PowerPoint inválido.': 'Invalid PowerPoint file.',
    'Nenhuma anotação do apresentador foi encontrada nesse PowerPoint.': 'No speaker notes were found in this PowerPoint file.',
    'Seu texto aparece assim, logo abaixo da câmera. As palavras lidas ficam coloridas e o texto rola sozinho enquanto você fala.':
      'Your text shows up like this, right below the camera. The words you\'ve read change color and the text scrolls by itself as you speak.',
    'Bom dia! Hoje vou mostrar como o texto aparece na tela cheia. Ajuste o tamanho, o alinhamento e a largura da coluna até a leitura ficar confortável. A linha de leitura mostra onde seus olhos devem ficar enquanto o texto sobe sozinho.':
      'Good morning! Today I\'ll show you how the text looks in full screen. Adjust the size, alignment and column width until reading feels comfortable. The reading line shows where your eyes should rest while the text moves up by itself.',

    /* ── Janela de leitura ── */
    'Página anterior (Ctrl+Alt+PageUp)': 'Previous page (Ctrl+Alt+PageUp)',
    'Pausar / retomar (Ctrl+Alt+P)': 'Pause / resume (Ctrl+Alt+P)',
    'Próxima página (Ctrl+Alt+PageDown)': 'Next page (Ctrl+Alt+PageDown)',
    'Microfone (Ctrl+Alt+M)': 'Microphone (Ctrl+Alt+M)',
    'Parar (Ctrl+Alt+S)': 'Stop (Ctrl+Alt+S)',
    'Prepare-se': 'Get ready',
    'Próxima página': 'Next page',
    'Fim da página — ⏭ para continuar': 'End of page — ⏭ to continue',
    'Fim do roteiro': 'End of script',
    'Carregando voz…': 'Loading voice…',
    'Microfone indisponível': 'Microphone unavailable',
    'Detector de voz indisponível': 'Voice detector unavailable',
    'Erro no reconhecimento de voz': 'Speech recognition error',
    'Preparando voz…': 'Preparing voice…',
    'No OBS, clique em “Iniciar câmera virtual”': 'In OBS, click “Start Virtual Camera”',
    'Câmera indisponível (em uso por outro app?)': 'Camera unavailable (in use by another app?)',

    /* ── Celular ── */
    'Controle': 'Control',
    'Enviar texto': 'Send text',
    'Sem conexão': 'Offline',
    'Conectado': 'Connected',
    'Sem conexão com o computador — tentando de novo…': 'No connection to the computer — trying again…',
    'Aberto no computador': 'Open on the computer',
    'Roteiro': 'Script',
    'Roteiro aberto no editor': 'Script open in the editor',
    'Modo de leitura': 'Reading mode',
    'segue as palavras': 'follows your words',
    'velocidade fixa': 'fixed speed',
    'Ativado': 'Activated',
    'anda enquanto fala': 'moves while you talk',
    'Iniciar leitura': 'Start reading',
    'A leitura começa no computador, com a contagem regressiva.': 'Reading starts on the computer, with the countdown.',
    'O roteiro no computador está vazio. Use “Enviar texto” para mandar um daqui.': 'The script on the computer is empty. Use “Send text” to send one from here.',
    'Pausado': 'Paused',
    'Lendo': 'Reading',
    'Fim': 'End',
    'Página anterior': 'Previous page',
    'Anterior': 'Previous',
    'Voltar uma linha': 'Back one line',
    'Linha': 'Line',
    'Pausar ou continuar': 'Pause or resume',
    'Pausar': 'Pause',
    'Continuar': 'Resume',
    'Avançar uma linha': 'Forward one line',
    'Próxima': 'Next',
    'Velocidade<b id="speed-val">2,5 palavras/s</b>': 'Speed<b id="speed-val">2.5 words/s</b>',
    'Seu ritmo de leitura': 'Your reading pace',
    'Velocidade enquanto você fala': 'Speed while you talk',
    'aprendendo…': 'learning…',
    'Mais devagar': 'Slower',
    'Mais rápido': 'Faster',
    'Do início': 'Restart',
    'Mic. desligado': 'Mic off',
    'Confirmar': 'Confirm',
    'Trocar na leitura': 'Swap in live',
    'Ler este texto': 'Read this text',
    '“Ler este texto” começa uma leitura nova no computador. “Trocar na leitura” troca o texto da página atual sem perder a posição.':
      '“Read this text” starts a new reading on the computer. “Swap in live” replaces the current page\'s text without losing your place.',
    'Escreva ou cole o roteiro aqui…': 'Write or paste the script here…',
    'Visual do celular': 'Phone display',
    'Visual neste celular': 'Display on this phone',
    'Tamanho do texto': 'Text size',
    'Diminuir texto': 'Smaller text',
    'A−': 'A−',
    'Aumentar texto': 'Larger text',
    'A+': 'A+',
    'Espelhar o texto<small>Para usar o celular num teleprompter com vidro</small>': 'Mirror the text<small>To use the phone in a teleprompter with glass</small>',
    'Espelhar o texto': 'Mirror the text',
    'Só os controles<small>Esconde o texto e deixa os botões maiores</small>': 'Controls only<small>Hides the text and makes the buttons bigger</small>',
    'Só os controles': 'Controls only',
    'Pronto': 'Done',
    'Voltou para o início da página': 'Back to the start of the page',
    'Toque de novo para parar a leitura': 'Tap again to stop reading',
    'Escreva um texto primeiro': 'Write some text first',
    'Texto trocado': 'Text replaced',

    /* ── Janelas do Windows (main.js) ── */
    'Abrir roteiro': 'Open script',
    'Salvar roteiro': 'Save script',
    'Roteiros e textos': 'Scripts and text files',
    'Todos os arquivos': 'All files',
    'Roteiro do InPromptu': 'InPromptu script',
    'Meu roteiro': 'My script',

    /* ── Versão web ── */
    'Uma janelinha sempre por cima dos outros programas. Arraste e redimensione como quiser.': 'A small window that stays on top of other programs. Drag and resize it as you like.',
    'Neste navegador ela ocupa a janela do site. No Chrome ou no Edge, fica sempre por cima dos outros programas.':
      'In this browser it fills the site\'s window. In Chrome or Edge, it stays on top of other programs.',
    'Ocupa a tela toda (ideal para monitor externo ou espelho). Esc sai da tela cheia; Esc de novo encerra a leitura.':
      'Fills the whole screen (ideal for an external monitor or a mirror). Esc leaves full screen; Esc again ends the reading.',
    'Abre também uma janela que acompanha a leitura, com este mesmo layout. Leve-a para o outro monitor (por exemplo, o do vidro do teleprompter) e aperte <kbd>F</kbd> para tela cheia. O navegador pode pedir para permitir janelas pop-up.':
      'Also opens a window that follows the reading, with this same layout. Move it to the other monitor (for example, the teleprompter glass one) and press <kbd>F</kbd> for full screen. The browser may ask you to allow pop-up windows.',
    'Abrir a segunda tela agora': 'Open the second screen now',
    'No rastreamento de voz, com o instante em que cada palavra foi dita. O arquivo <b>.srt</b> é baixado ao terminar a leitura (com o nome do vídeo, se o OBS gravou).':
      'In voice tracking, with the moment each word was spoken. The <b>.srt</b> file is downloaded when the reading ends (named after the video, if OBS recorded).',
    'Funciona em qualquer rede: o celular e o computador só precisam de internet. A conexão é direta entre os dois aparelhos (WebRTC, criptografada); o serviço público do <a href="#" data-href="https://peerjs.com">PeerJS</a> só apresenta um ao outro. Deixe esta aba aberta durante a leitura.':
      'Works on any network: the phone and the computer just need internet access. The connection goes straight between the two devices (WebRTC, encrypted); the public <a href="#" data-href="https://peerjs.com">PeerJS</a> service only introduces them to each other. Keep this tab open while reading.',
    'Senha salva neste navegador.': 'Password saved in this browser.',
    'Na primeira conexão, o navegador pode pedir permissão para acessar os aparelhos da rede local: é o OBS no seu computador.':
      'On the first connection, the browser may ask for permission to access devices on your local network: that\'s OBS on your computer.',
    'Na versão web, funcionam com o InPromptu em foco.': 'In the web version, they work while InPromptu is in focus.',
    'Esta é a versão web. O <a href="#" data-href="https://github.com/crie-studio/inpromptu/releases/latest">app para Windows</a> tem ainda a faixa no topo da tela, perto da câmera, o modo escondido das gravações e atalhos que funcionam com outros programas na frente.':
      'This is the web version. The <a href="#" data-href="https://github.com/crie-studio/inpromptu/releases/latest">Windows app</a> also has the band at the top of the screen, near the camera, the mode hidden from recordings, and shortcuts that work with other programs in front.',
    '<a href="../" target="_blank" rel="noopener">Conheça o InPromptu</a>: a página com tudo o que ele faz, em demonstrações ao vivo.':
      '<a href="../en/" target="_blank" rel="noopener">Meet InPromptu</a>: the page with everything it does, in live demos.',
    'A segunda tela abre durante a leitura.': 'The second screen opens during the reading.',
    'O navegador bloqueou a segunda tela. Permita janelas pop-up para este site ou use o botão "Abrir a segunda tela".':
      'The browser blocked the second screen. Allow pop-up windows for this site or use the "Open the second screen now" button.',
    'Permita o microfone para este site: clique no ícone ao lado do endereço e ative "Microfone".':
      'Allow the microphone for this site: click the icon next to the address and turn on "Microphone".',
    'Este link já está aberto em outra aba do InPromptu. Feche a outra aba ou gere um novo link.':
      'This link is already open in another InPromptu tab. Close the other tab or create a new link.',
    'Sem conexão com a internet para ligar o celular.': 'No internet connection to link the phone.',
    'O serviço de conexão (PeerJS) não respondeu. Tentando de novo…': 'The connection service (PeerJS) didn\'t respond. Trying again…',
    'A conexão com o serviço caiu. Tentando de novo…': 'The connection to the service dropped. Trying again…',
    'Este navegador não permite a conexão com o celular.': 'This browser doesn\'t support connecting to the phone.',
    'Falha na conexão com o celular.': 'Couldn\'t connect to the phone.',
  };

  const has = (k) => Object.prototype.hasOwnProperty.call(text, k);
  /** Tradução de um trecho de dentro de uma frase (ex.: o motivo de um erro). */
  const inner = (s) => {
    if (has(s)) return text[s];
    const code = /^o OBS recusou \(código (\d+)\)$/.exec(s);
    if (code) return `OBS refused (code ${code[1]})`;
    const site = /^o site respondeu (\d+)$/.exec(s);
    if (site) return `the site responded ${site[1]}`;
    return s;
  };
  const plural = (n, one, many) => `${n} ${n === '1' ? one : many}`;

  const patterns = [
    // Editor: "Página 2 de 3 · 120 palavras · 300 palavras no total · ~2 min 10 s no seu ritmo"
    [/^(?:Página (\d+) de (\d+) · (\d+) palavras · )?(\d+) palavras no total · (~[^·]+?)( no seu ritmo)?$/,
      (m, p, of, words, total, time, pace) => `${p ? `Page ${p} of ${of} · ${plural(words, 'word', 'words')} · ` : ''}${plural(total, 'word', 'words')} in total · ${time}${pace ? ' at your pace' : ''}`],
    // Editor: "● Lendo — Página 2/3 · 45% · pausado"
    [/^● Lendo — (?:Página (\d+\/\d+) · )?(\d+)%( · pausado)?( · microfone desligado)?$/,
      (m, page, pct, paused, muted) => `● Reading — ${page ? `Page ${page} · ` : ''}${pct}%${paused ? ' · paused' : ''}${muted ? ' · microphone off' : ''}`],
    [/^(\d+) páginas? carregadas?\.$/, (m, n) => `${plural(n, 'page', 'pages')} loaded.`],
    [/^Baixando o modelo de voz \((.+), ~(\d+) MB\)\. Isso só acontece uma vez…$/, 'Downloading the voice model ($1, ~$2 MB). This only happens once…'],
    [/^■ Parar e salvar \((\d+:\d+)\)$/, '■ Stop and save ($1)'],
    [/^A amostra não foi salva: (.+)$/, (m, why) => `The sample wasn't saved: ${inner(why)}`],
    [/^Salva: (.+) \((\d+) s\)\.$/, 'Saved: $1 ($2 s).'],
    [/^Última: (.+)$/, 'Latest: $1'],
    [/^Conectado ao OBS (.+)\.$/, 'Connected to OBS $1.'],
    [/^Erro no reconhecimento de voz: ?(.*)$/, (m, why) => `Speech recognition error${why ? `: ${inner(why)}` : ''}`],
    [/^Baixando… (\d+)%$/, 'Downloading… $1%'],
    [/^Baixar \((\d+) MB\)$/, 'Download ($1 MB)'],
    [/^Não foi possível baixar o modelo: (.+)$/, (m, why) => `Couldn't download the model: ${inner(why)}`],
    [/^Falha no download \(HTTP (\d+)\)$/, 'Download failed (HTTP $1)'],
    [/^Modelo desconhecido: (.+)$/, 'Unknown model: $1'],
    [/^(\d+) dispositivos? conectados?$/, (m, n) => `${plural(n, 'device', 'devices')} connected`],
    [/^A porta (\d+) já está em uso\.$/, 'Port $1 is already in use.'],
    [/^Microfone (\d+)$/, 'Microphone $1'],
    [/^Câmera (\d+)$/, 'Camera $1'],
    [/^(.+ — \d+×\d+) \(principal\)$/, '$1 (main)'],
    [/^Página (\d+)$/, 'Page $1'],
    [/^(\d+)% da altura$/, '$1% of the height'],
    // OBS e legendas
    [/^OBS: não consegui começar a gravar \((.*)\)\.$/, (m, why) => `OBS: couldn't start recording (${inner(why)}).`],
    [/^OBS: não consegui parar a gravação \((.*)\)\.$/, (m, why) => `OBS: couldn't stop recording (${inner(why)}).`],
    [/^OBS: não troquei para a cena "(.*)" \((.*)\)\.$/, (m, name, why) => `OBS: didn't switch to the scene "${name}" (${inner(why)}).`],
    [/^OBS: não marquei o capítulo "(.*)" \(precisa do OBS 30\.2\+ gravando em MP4 híbrido\)\.$/,
      'OBS: didn\'t mark the chapter "$1" (requires OBS 30.2+ recording to Hybrid MP4).'],
    [/^Não consegui salvar as legendas: (.*)$/, (m, why) => `Couldn't save the subtitles: ${inner(why)}`],
    [/^Legendas baixadas como "(.*)"\. Coloque-as na pasta do vídeo do OBS\.$/, 'Subtitles downloaded as "$1". Put them in the OBS video folder.'],
    [/^Legendas baixadas: "(.*)"\.$/, 'Subtitles downloaded: "$1".'],
    [/^o OBS recusou \(código (\d+)\)$/, 'OBS refused (code $1)'],
    // Janela de leitura
    [/^(\S+) · faltam (\S+)$/, '$1 · $2 left'],
    [/^Meta: (\S+)$/, 'Target: $1'],
    // Celular
    [/^Começa em (\d+)$/, 'Starts in $1'],
    [/^Página (\d+\/\d+)$/, 'Page $1'],
    [/^(· )?faltam (\S+)$/, '$1$2 left'],
    [/^(\d+)(?:,(\d+))? palavras\/s$/, (m, a, b) => `${a}${b ? `.${b}` : ''} words/s`],
    [/^(?:(\d+) páginas · )?(\d+) palavras?(?: · (~\d+ min))?$/,
      (m, pages, words, min) => [pages && `${pages} pages`, plural(words, 'word', 'words'), min].filter(Boolean).join(' · ')],
  ];

  return { text, patterns };
}));
