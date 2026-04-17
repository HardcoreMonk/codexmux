// Nerd Font icon mapping (based on tmux-nerd-font-window-name)
// https://github.com/joshmedeski/tmux-nerd-font-window-name

const PROCESS_ICONS: Record<string, string> = {
  // shells
  bash: '\ue795',     //
  zsh: '\ue795',      //
  fish: '\ue795',     //
  sh: '\ue795',       //
  dash: '\ue795',     //
  tcsh: '\ue795',     //
  nu: '\ue795',       //
  // editors
  nvim: '\ue62b',     //
  vim: '\ue62b',      //
  vi: '\ue62b',       //
  nano: '\ue62b',     //
  emacs: '\ue632',    //
  hx: '\u{f0624}',   // 󰘤
  code: '\ue60c',     //
  // version control
  git: '\ue702',      //
  gitui: '\ue702',    //
  tig: '\ue702',      //
  gh: '\ue709',       //
  lazygit: '\ue702',  //
  jj: '\ue702',       //
  lazyjj: '\ue702',   //
  // languages / runtimes
  node: '\ue718',     //
  deno: '\ue718',     //
  bun: '\ue718',      //
  python: '\ue73c',   //
  python3: '\ue73c',  //
  go: '\ue626',       //
  ruby: '\ue739',     //
  java: '\ue738',     //
  rust: '\ue7a8',     //
  rustc: '\ue7a8',    //
  cargo: '\ue7a8',    //
  swift: '\ue755',    //
  dart: '\ue798',     //
  elixir: '\ue62d',   //
  perl: '\ue769',     //
  php: '\ue73d',      //
  R: '\ue881',        //
  julia: '\ue80d',    //
  scala: '\ue737',    //
  zig: '\ue8ef',      //
  // package managers
  npm: '\ue718',      //
  pnpm: '\ue718',     //
  yarn: '\ue718',     //
  pip: '\ue73c',      //
  pip3: '\ue73c',     //
  brew: '\uf0fc',     //
  apt: '\uf487',      //
  dnf: '\uf487',      //
  pacman: '\uf487',   //
  yay: '\uf487',      //
  paru: '\uf487',     //
  // build tools
  make: '\uf423',     //
  cmake: '\uf423',    //
  gradle: '\ue7f2',   //
  maven: '\ue82c',    //
  webpack: '\u{f072b}', // 󰜫
  tsc: '\ue628',      //
  // containers / k8s
  docker: '\ue7b0',   //
  lazydocker: '\ue7b0', //
  kubectl: '\u{f10fe}', // 󱃾
  k9s: '\u{f10fe}',  // 󱃾
  helm: '\u{f10fe}', // 󱃾
  minikube: '\u{f10fe}', // 󱃾
  // cloud / infra
  aws: '\ue7ad',      //
  gcloud: '\ue7f1',   //
  terraform: '\ue8bd', //
  ansible: '\ue723',  //
  vagrant: '\ue8d0',  //
  // network / transfer
  ssh: '\u{f0ce0}',  // 󰳠
  scp: '\u{f0ce0}',  // 󰳠
  curl: '\uf0c1',     //
  wget: '\uf0c1',     //
  rsync: '\uf0c1',    //
  ping: '\uf0c1',     //
  // monitoring
  htop: '\uf080',     //
  btop: '\uf080',     //
  top: '\uf080',      //
  btm: '\uf080',      //
  glances: '\uf080',  //
  mactop: '\uf080',   //
  // file managers
  ranger: '\uf413',   //
  yazi: '\uf413',     //
  lf: '\uf413',       //
  lfcd: '\uf413',     //
  // databases
  mysql: '\ue704',    //
  psql: '\ue76e',     //
  mongo: '\ue7a4',    //
  redis: '\ue76d',    //
  sqlite: '\ue7c4',   //
  // misc
  tmux: '\ue795',     //
  screen: '\ue795',   //
  sudo: '\uf0e7',     //
  bat: '\u{f0b1f}',  // 󰬟
  gpg: '\uf084',      //
  openssl: '\uf084',  //
  zip: '\uf187',      //
  unzip: '\uf187',    //
  jest: '\uf0c3',     //
  // claude
  claude: '\u{f0174}',  // 󰅴
  // ai tools
  codex: '\u{f0174}',   // 󰅴
};

const FALLBACK_ICON = '\ue795'; //

export const getProcessIcon = (processName: string | null | undefined): string => {
  if (!processName) return FALLBACK_ICON;
  return PROCESS_ICONS[processName] ?? FALLBACK_ICON;
};

export const hasProcessIcon = (processName: string | null | undefined): boolean => {
  if (!processName) return false;
  return processName in PROCESS_ICONS;
};

const INTERPRETERS = new Set(['node', 'python', 'python3', 'ruby', 'perl', 'deno', 'bun']);

export const isInterpreter = (processName: string | null | undefined): boolean => {
  if (!processName) return false;
  return INTERPRETERS.has(processName);
};
