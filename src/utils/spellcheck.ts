// Curated compact English + Software Engineering dictionary for offline-first spellchecking
const BASE_WORDS = new Set(
  (
    'a able about above accept access account accounts across act action actions active actual add added adding address admin after again against age agent agents agree ahead air all allow almost alone along alongside already also although always am among amount an and angle another answer any anyone anything antigravity api app appear apply approach apps archive architecture are area around arrange array arrive arrow arrows art article as ask asset assets assign assume at attach attempt auth author auto autosave available avoid away ' +
    'back backup bad balance band bar base based basic batch be bear bearer beat became because become bed been before began begin behind being believe below belt bench benefit best better between beyond big binary bionic bit black block blocks blog blue board body bold book border both bottom box branch break bridge brief bright bring broad broken browser build building built bulk bullet bundle business busy but button buy by ' +
    'cache call called calm came can cancel canvas cap capabilities capability capture card cards care career careful carry case cases catch category cause center central certain chain change changed changes channel chapter character chart check checkbox checklist checklists checked child children choice choose chose chosen chrome circle claim class claude clean clear click client clients clip close closed cloud code coding codex collaborate collect color colors column columns combine come command comment commit common compare compile complete component components compose concept concepts concurrent condition config configure confirm connect connected console constant construct container content context continue contrast control controls convert copy core corner correct cost could count counter course cover create created creating creative creator credit cross crypto css current cursor custom customize cut cycle ' +
    'dark dashboard data database date day days dead deal debug decide decision decode decrypt decrypted decrypts deep default defect define degree delay delete deleted deliver demo dense deny depend deploy deployed deployment deployments design designer desktop detail details detect develop developer device devices diagram diagramming diagrams dialog diamond diff difference different digital direct direction directly directory disable disabled discuss display distinct distribute divide do doc docs docker document documents does doing domain done dot double down download draft drafting drag draw drawing drew driven drop dropped dual due dummy duplicate during dynamic ' +
    'each early earn earth ease easily east easy echo edge edges edit edited editing editor education effect effective effort either element elements else email embed embedded emerald empty enable enabled encode encrypt encrypted encryption encrypts end endpoint endpoints energy engine engineer ensure enter entire entity entry envelope env environment equal error errors escape especially essential establish estimate evaluate even event events ever every everyone everything evidence exact exactly example exceed except exchange execute exist existing expand expect experience experiment expert explain explicit explore export expose exposed express extend extension external extra extract ' +
    'face fact factor fail failed failing failure fair fall false familiar family famous fancy far fast faster feature features feed feedback feel feet fell felt few field fields figure file files fill filter filtered final finally find finding findings fine finish finished fire firm first fit fix fixed flag flags flash flat flexibility flexible flip float flow flows fluid focus folder folders follow following font fonts food foot for force forced form format formatting forms forward found frame framework free fresh from front frontend full fully function functional functions fundamental further future ' +
    'gain game games gap gate gather gave general generate generated get getting giant give given glass global gmail go goal goals goes going gold good google got govern grade gradient graph graphics gray great green grid ground group grow growth guard guess guide guidelines ' +
    'habit had half hand handle handled handler hang happen hard has hash have having he head header headers heading headings health hear heart heat heavy held help helpful her here hermes hero hex hexagon hide high highlight highlighted highlighter highlights him himself his history hit hold home honest hope horizontal host hosted hosting hot hour hours house how however html http https hub huge human ' +
    'icon icons id idea ideas ideal identify identity idle if ignore ignored ignores image images imagine immediate immediately impact implement implemented implicit imply import important improve improved in inch include included includes including income increase indeed index indexeddb indicate indicator indigo individual industry info information inherit initial inline input inputs insert inside inspect install installed instance instead instrument intact integrate integrated integration integrity intent interact interactive interface internal internet into introduce invalid inventory invert invite invoke is island isolate isolated issue issues it item items its itself ' +
    'java javascript join joined json jump just ' +
    'keep keeping kept key keyboard keys keyword keywords kick kind kinds knew know knowledge known ' +
    'label labels lack laid land landing language large larger last late later latest launch layer layers layout lazy lead leader leads learn learning least leave left legacy legal legibility legible length less lesson let letter letters level library license lie life light lighting like likely limit line linear lines link linked links linux list listed listen live liveview lmstudio load loaded loading local locate location lock locked log logic login logout long look looking loop loose lose loss lost lot loud love low lower lucky ' +
    'machine made magic main maintain major make making manage managed manager manifest manual many map mapped mapping margin mark markdown marker market marks mask master match matched matches material math matrix max maximum may maybe mcp me mean meaning means measure media medium meet member members memory menu merge merged message messages meta metadata metal method methods metric metrics micro middle might mild milestone milestones mile milk mind minimal minimum minor mint minute minutes mirror miss missing mistake mix mixed mobile mode model models modern modify modular module modules moment money monitor monitoring mono month months more morning most mostly motion mount mouse move moved movement moving much multi multiple multiply must my myself ' +
    'name named names narrow native natural nature near nearly necessary need needed needs negative neighbor neither nested net network never new newer news next nice night nightmode no node nodes noise nominal none normal north not note notebook notes nothing notice notify noun now null number numbers numeric numerous ' +
    'object objects observe obtain obvious obviously obsidian occasion occur odd of off offer office offline often ok okay old older on once one ongoing online only onto open opened opening opencode opennote operate operation operator opinion opponent optical optimal optimize option options or order ordered organic organization organize organized orient origin original other others our out outcome outer outline output outside over overall overflow overlap overlay override own owner ' +
    'pace pack package packages page pages paid pain paint pair paired pairs palette pan panel panels paper paragraph parallel param parameters parent parse parsed parser part partial particular partly parts pass passed passphrase passphrases password passwords past paste path paths pattern patterns pause pay pdf peer pen pending people per percent perfect perform performance perhaps period permanent permission permissions persist persistent person personal perspective phase phone photo photos phrase physical pick picked picker picture piece pieces pill pin pinned pipeline pitch pixel pixels place placed plain plan planned planning platform play player please plenty plug plugin plus pocket point pointer points policy polish poll pool poor pop popular populate populated port portable portal portion position positive possible post potential powder power powerful practical practice pre prefer preferred prefix prepare present preserve press pretty prevent preview previous price pricing primary print printed printer prior priority privacy private pro probably problem problems procedure proceed process produce product production profile profit program progress project projects promise promote prompt proof proper properly property proposal propose protect protection protocol protocols prove provide provided provider providers proxy public publish published pull pulled purpose push pushed put puzzle python ' +
    'quality quantitative quarter query question questions quick quickly quiet quite quote ' +
    'race radial radio radius raise raised ran random range rank rapid rate rather ratio raw reach reached react read readable reader reading ready real realize really reason reasonable rebuild recall receive recent recently recognize recommend record recorded recover recovery red reduce reduced refer reference references refine reflect refresh region register registered regular reject relate related relation relative release relevant reliable relief rely remain remaining remember remind remote remove removed rename render rendered rendering repeat replace replaced reply report represent request require required requirement requirements research reserve reset resize resolve resolved resource resources respect respond response responsibilities responsibility responsible rest restart restore restrict result results retain retire return reveal review revise revisit rich rid ride right ring rise risk road roadmap robust rock role roles roll room root rose rotate rough round rounded route router routes routing row rows rule rules run running runtime rust ' +
    'sad safe safety said salt same sample sandbox sans sat save saved saving saw say says scale scaling scan scatter scenario scene scenes schedule schema scheme school science scope score screen screenshot screenshots script scripts scroll scrub search searched searching season seat second secondary secret secrets section sections secure security see seed seeing seem seems seen segment segmented select selected selection self sell send sender sense sent separate separated sequence serial series serif server servers service services session sessions set sets setting settings settle setup seven several severe shadow shadows shape shapes share shared sharing sharp she sheet sheets shell shift ship shipped short should shoulder show showed showing shown shows shrink side sidebar sign signal signature signed silent silver similar simple simply simulate simulation since single sink sit site sites situation six size sizes skeleton sketch skip skipped slate slice slide slides slight slightly slow small smaller smart smooth snap snapshot snapshots snippet snippets so social socket soft software solid solution solve solved some someone something sometimes somewhere soon sort sorted sound source sources south space spaces spacing span sparse speak special specific specifically specify speed spellcheck spelling spend spent sphere spin split spoke spot spread spreadsheet spring square squares stable stack stage stand standard standards star start started starting state stated statement states static status stay steady step steps stick sticky still stock stood stop stopped storage store stored stores story straight strain strange strategy stream streaming street strength stress stretch strict strictly strike strikethrough string strings strip strong structure structured structures studio study stuff style styled styles styling sub subfolder subfolders subject submit subtle subtract succeed success successful such sudden suddenly suffer sufficient suggest suggestion suggestions suit suitable sum summary summer sun super supply support supported supporting suppose sure surface surfaces surge surgical surround survive swap swatch swift switch switched switching symbol symbols sync synced synchronize synchronizing syntax system systems ' +
    'tab table tables tablet tabs tag tagged tags tail take taken taking talk tall tap target targets task tasks taught tax team teams tech technical technique techniques telemetry tell tells template templates temporary ten tend tension term terms test tested testing tests text texture than thank thanks that the their them theme themed themes themselves then theory there therefore these they thick thin thing things think third this those though thought thousand thread threads three threshold threw through throughout throw thumb thus tick ticker tie tight tile tiles till time timeframe timer times timestamp timestamps tiny tip tips title titled titles to today together told tolerance tomorrow tone token tokens too took tool toolbar tools top topic topics total touch toward towards track tracked tracker tracking trade traditional traffic train training trait traits transfer transform transformation translate transport trap tray treat tree trees trend trends triangle trick tried trigger triggers trim trip trouble true trust try trying tube tune tunnel turn turned turning tutorial twelve twenty twice twin two type types typical typically ' +
    'ui ultimate ultrawide unable unaware uncertain under understand understood undo uniform unique unit units universal universe unknown unless unlike unlikely unlock unlocked unboxed unsigned until unusual up update updated updates updating upgrade upload uploaded upon upper urban urge us usage use used useful user users uses using usual usually utility utilize ' +
    'vague valid validate validation valley valuable value values var variable variables variation variety various vary vast vault vaults vector vehicle vendor verify verifying version versioned versions vertical very via viable video videos view viewer viewport viewports views vintage violet virtual visible vision visit visual voice void volume vote ' +
    'wait waiting wake walk wall wallet want wanted wants warm warn warning warnings was wash waste watch water wave waves way ways we weak wealth wear weather web webhook webhooks webgl website websites week weeks weight welcome well went were west wet what whatever wheel when whenever where whereas wherever whether which while white who whoever whole whom whose why wide widen wider width wiki wikilink wikilinks will willing win window windows wine wing winner winter wire wired wireless wise wish with within without woke woman women won wonder wonderful wood wooden word words wore work worked worker working works workspace workspaces world worn worry worse worst worth would wrap wrapped wrapper wrapping write writer writes writing written wrong wrote ' +
    'xml yaml yarn year years yellow yes yesterday yet yield you young your yours yourself zero zone zones zoom'
  ).split(/\s+/),
);

export interface WordOccurrence {
  word: string;
  start: number;
  end: number;
}

export interface SpellIssue {
  word: string;
  start: number;
  end: number;
  suggestions: string[];
}

export function extractWordAtPosition(text: string, index: number): WordOccurrence | null {
  if (!text || index < 0 || index > text.length) return null;
  let start = index;
  let end = index;
  while (start > 0 && /[a-zA-Z']/.test(text[start - 1])) {
    start -= 1;
  }
  while (end < text.length && /[a-zA-Z']/.test(text[end])) {
    end += 1;
  }
  const word = text.slice(start, end).replace(/^'+|'+$/g, '');
  if (!word || word.length < 2) return null;
  return { word, start, end };
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[b.length];
}

export function isWordValid(word: string, ignoredWords: Set<string>): boolean {
  const clean = word.toLowerCase().replace(/^'+|'+$/g, '');
  if (!clean || clean.length <= 2) return true;
  if (/^[A-Z0-9_]+$/.test(word)) return true; // acronyms like E2EE, API, MCP
  if (ignoredWords.has(clean) || BASE_WORDS.has(clean)) return true;
  if (clean.endsWith("'s") && BASE_WORDS.has(clean.slice(0, -2))) return true;
  // Common regular suffixes
  if (clean.endsWith('s') && BASE_WORDS.has(clean.slice(0, -1))) return true;
  if (clean.endsWith('es') && BASE_WORDS.has(clean.slice(0, -2))) return true;
  if (clean.endsWith('ed') && (BASE_WORDS.has(clean.slice(0, -2)) || BASE_WORDS.has(clean.slice(0, -1)))) return true;
  if (clean.endsWith('ing') && (BASE_WORDS.has(clean.slice(0, -3)) || BASE_WORDS.has(`${clean.slice(0, -3)}e`))) return true;
  if (clean.endsWith('ly') && BASE_WORDS.has(clean.slice(0, -2))) return true;
  return false;
}

export function getSpellingSuggestions(word: string, limit = 4): string[] {
  const target = word.toLowerCase();
  const candidates: Array<{ word: string; dist: number }> = [];
  for (const dictWord of BASE_WORDS) {
    if (Math.abs(dictWord.length - target.length) > 2) continue;
    const dist = levenshtein(target, dictWord);
    if (dist <= 2) {
      candidates.push({ word: dictWord, dist });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist || a.word.localeCompare(b.word));
  const preserveCap = word[0] && word[0] === word[0].toUpperCase();
  return candidates.slice(0, limit).map((c) =>
    preserveCap ? c.word.charAt(0).toUpperCase() + c.word.slice(1) : c.word,
  );
}

/**
 * Scans Markdown prose (ignoring fenced code blocks, inline code, URLs, and #tags)
 * for potential spelling mistakes not in the dictionary or ignoredWords list.
 * Optionally skips the word currently intersecting `activeCursorIndex` so typing mid-word does not flicker.
 */
export function findSpellingIssues(
  markdown: string,
  ignoredWords: Set<string>,
  maxIssues = 25,
  activeCursorIndex?: number | null,
): SpellIssue[] {
  // Mask out code blocks, inline code, URLs, and concept JSON so we only check natural prose
  const masked = markdown
    .replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
    .replace(/https?:\/\/\S+/g, (m) => ' '.repeat(m.length))
    .replace(/(?:^|\s)#[a-zA-Z0-9_-]+/g, (m) => ' '.repeat(m.length));

  const issues: SpellIssue[] = [];
  const wordRegex = /\b[a-zA-Z]{3,}\b/g;
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(masked)) !== null) {
    const word = match[0];
    const start = match.index;
    const end = start + word.length;
    if (
      activeCursorIndex !== undefined &&
      activeCursorIndex !== null &&
      activeCursorIndex >= start &&
      activeCursorIndex <= end
    ) {
      continue;
    }
    if (!isWordValid(word, ignoredWords)) {
      issues.push({
        word,
        start,
        end,
        suggestions: getSpellingSuggestions(word, 3),
      });
      if (issues.length >= maxIssues) break;
    }
  }
  return issues;
}

export function isSpellcheckSuppressedForNote(
  noteId: string,
  folderId: string | null,
  folders: Array<{ id: string; parentId: string | null; deleted?: boolean }>,
  ignoredNoteIds: Set<string>,
  ignoredFolderIds: Set<string>,
): { suppressed: boolean; reason: 'page' | 'folder' | null; folderId: string | null } {
  if (ignoredNoteIds.has(noteId)) {
    return { suppressed: true, reason: 'page', folderId: null };
  }
  if (!folderId || ignoredFolderIds.size === 0) {
    return { suppressed: false, reason: null, folderId: null };
  }
  const map = new Map(folders.filter((f) => !f.deleted).map((f) => [f.id, f]));
  const visited = new Set<string>();
  let currId: string | null = folderId;
  while (currId && !visited.has(currId)) {
    if (ignoredFolderIds.has(currId)) {
      return { suppressed: true, reason: 'folder', folderId: currId };
    }
    visited.add(currId);
    currId = map.get(currId)?.parentId ?? null;
  }
  return { suppressed: false, reason: null, folderId: null };
}

export function replaceWordInText(
  text: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return text.slice(0, start) + replacement + text.slice(end);
}
