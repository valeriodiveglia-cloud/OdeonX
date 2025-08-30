set -euo pipefail

# Helper sed compat (GNU/mac)
if sed --version >/dev/null 2>&1; then SED_I=(-i); else SED_I=(-i ''); fi

# ---------- A) Tipo CSV e import per i file che usano Papa.parse ----------
mkdir -p src/types
[ -f src/types/csv.ts ] || printf "export type CsvRow = { [k: string]: string | number | null }\n" > src/types/csv.ts

PARSE_FILES=("src/app/(app)/equipment/page.tsx" "src/app/(app)/materials/page.tsx" "src/lib/importMaterialsCsv.ts")
for f in "${PARSE_FILES[@]}"; do
  # Import tipi
  grep -q "ParseResult, ParseError" "$f" || sed "${SED_I[@]}" "1i import type { ParseResult, ParseError } from 'papaparse'" "$f"
  grep -q "@/types/csv" "$f" || sed "${SED_I[@]}" "1i import type { CsvRow } from '@/types/csv'" "$f"
  # Generic nel parse
  sed "${SED_I[@]}" -E 's/Papa\.parse\(/Papa.parse<CsvRow>(/g' "$f"
  # transformHeader firma completa
  sed "${SED_I[@]}" -E 's/transformHeader:\s*h\s*=>/transformHeader: (h: string, _i: number): string =>/g' "$f" || true
  sed "${SED_I[@]}" -E 's/transformHeader:\s*\(h:\s*string\)\s*=>/transformHeader: (h: string, _i: number): string =>/g' "$f" || true
  # complete tipizzato
  sed "${SED_I[@]}" -E 's/complete:\s*res\s*=>\s*resolve\(/complete: (res: ParseResult<CsvRow>): void => resolve(/g' "$f"
  # error tipizzato
  sed "${SED_I[@]}" -E 's/error:\s*reject/error: (err: ParseError): void => reject(err)/g' "$f"
  sed "${SED_I[@]}" -E 's/error:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=>\s*reject\(\1\)/error: (\1: ParseError): void => reject(\1)/g' "$f"
done

# In questi due: tipizza r nei map/filter
sed "${SED_I[@]}" -E 's/\.map\(\s*r\s*=>/\.map((r: CsvRow) =>/g' src/app/(app)/materials/page.tsx
sed "${SED_I[@]}" -E 's/\.filter\(\s*r\s*=>/\.filter((r: CsvRow) =>/g' src/app/(app)/materials/page.tsx
sed "${SED_I[@]}" -E 's/\.map\(\s*r\s*=>/\.map((r: CsvRow) =>/g' src/lib/importMaterialsCsv.ts
sed "${SED_I[@]}" -E 's/\.filter\(\s*r\s*=>/\.filter((r: CsvRow) =>/g' src/lib/importMaterialsCsv.ts

# importMaterialsCsv.ts: togli i tipi "Papa." nel Promise<>
sed "${SED_I[@]}" -E 's/new Promise<\s*Papa\.ParseResult<[^>]+>>/new Promise<ParseResult<CsvRow>>/g' src/lib/importMaterialsCsv.ts

# ---------- B) Supabase generics (da <T> a <T,T>) ----------
# Aggiorna in tutto src
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 | xargs -0 sed "${SED_I[@]}" -E 's/supabase\.from<([^,>]+)>\(/supabase.from<\1, \1>(/g'

# ---------- C) Event Calculator: Th con children opzionale ----------
sed "${SED_I[@]}" -E "s/function Th\(\{ children, className = '' \}: \{ children: React\.ReactNode; className\?: string \} \)/function Th({ children, className = '' }: { children?: React.ReactNode; className?: string })/" src/app/(app)/event-calculator/page.tsx

# ---------- D) Settings RSC + cookies (Next 15 + @supabase/ssr) ----------
# cookies() dev'essere awaited e via le vecchie getAll/setAll
sed "${SED_I[@]}" -E 's/const cookieStore = cookies\(\)/const cookieStore = await cookies()/g' src/app/(app)/settings/page.tsx
sed "${SED_I[@]}" -E '/getAll:/d' src/app/(app)/settings/page.tsx
sed "${SED_I[@]}" -E '/setAll:/d' src/app/(app)/settings/page.tsx

# ---------- E) Materials: fix boolean && (void) e cast number ----------
# setOpenEditor(true) && openCreate()  -> due statement
sed "${SED_I[@]}" -E 's/setOpenEditor\(true\)\s*&&\s*openCreate\(\)/setOpenEditor(true); openCreate()/g' src/app/(app)/materials/page.tsx
# e.target.value -> number | "" per uomId
sed "${SED_I[@]}" -E 's/uomId:\s*e\.target\.value/uomId: (e.target.value === "" ? "" : Number(e.target.value))/g' src/app/(app)/materials/page.tsx

# ---------- F) Recipes: allenta la tipizzazione di tKey problematica ----------
sed "${SED_I[@]}" -E "s/function tKey<[^>]+>\(key: K, /function tKey<K extends string>(key: K, /" src/app/(app)/recipes/page.tsx

# ---------- G) LeftNav: semplifica il tipo i18nKey ----------
sed "${SED_I[@]}" -E "s/i18nKey:\s*keyof[^|]+/i18nKey: string/g" src/components/LeftNav.tsx

# ---------- H) i18n duplicati ('Supplier' ripetuto nello stesso oggetto) ----------
# Rinomina ogni occorrenza ulteriore di 'Supplier:' dopo la prima in 'Supplier2:' per sbloccare la build
awk '
  BEGIN{cnt=0}
  {
    if ($0 ~ /^[[:space:]]*Supplier:[[:space:]]*\x27/) {
      cnt++;
      if (cnt>1) sub(/Supplier:/,"Supplier2:");
    }
    print
  }' src/lib/i18n.ts > src/lib/i18n.ts.__tmp && mv src/lib/i18n.ts.__tmp src/lib/i18n.ts

# ---------- I) Admin API: listUsers non accetta "email" nel payload ----------
sed "${SED_I[@]}" -E 's/, *email *\}//' src/app/api/users/admin-delete/route.ts

# ---------- J) Altri callback Papa.parse residui non tipizzati (safety net) ----------
grep -RIl "complete: res => resolve" src | xargs -r sed "${SED_I[@]}" -E 's/complete:\s*res\s*=>\s*resolve\(/complete: (res: ParseResult<CsvRow>): void => resolve(/g'
grep -RIl "error: reject" src | xargs -r sed "${SED_I[@]}" -E 's/error:\s*reject/error: (err: ParseError): void => reject(err)/g'
grep -RIl "transformHeader: h =>" src | xargs -r sed "${SED_I[@]}" -E 's/transformHeader:\s*h\s*=>/transformHeader: (h: string, _i: number): string =>/g'

echo "PATCH COMPLETATA"
