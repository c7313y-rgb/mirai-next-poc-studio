# 学習シーンの画像

- ファイル: `client/public/images/learning-scene.png`
- 作成方法: 組み込みimage_genツール（imagegenスキル）。実在する生徒・学校・企業の写真ではありません。
- 用途: ログイン画面、各役割のダッシュボード。画面内にAI生成イメージと表示。
- 実行時の画像生成API呼び出しはありません。

## 最終生成プロンプト

Use case: photorealistic-natural. Asset type: a wide editorial hero photograph for a Japanese high school career learning web application. Primary request: show three Japanese high school students (mixed gender, modest casual schoolwear, age 16-18) with a female teacher and an adult male manufacturing engineer collaborating around a wooden classroom table, examining a small simple robotic gripper and writing ideas in notebooks, bright contemporary science classroom, natural candid expressions, no posed smiles. Warm daylight, realistic textures, clean premium educational editorial photography, muted navy blue and sage accents. Landscape composition 3:2, people and table on right two thirds with bright softly blurred classroom on left for potential UI overlay. No text, no logos, no watermark. This image represents a fictional learning scene, not real persons.

画面内の小さな図版・マークはSVG/CSSで作成しています。

## 0.4.0 追加画像（2026-09-18）

組み込み `image_gen` で新規生成し、WebPへ変換して同梱しました。外部画像ホスティングや実行時の画像生成APIは使いません。すべて架空の人物・場面であり、実際の提携先・生徒・活動実績を示す写真ではありません。画面にもAI生成イメージの表示を付けています。

| ファイル | 用途 |
|---|---|
| `client/public/images/enterprise-v2.webp` | 企業ホーム、カリキュラムの作成・編集、工学系テーマ |
| `client/public/images/fieldwork-v2.webp` | ログイン、教員ホーム、テーマ探し、越境体験 |
| `client/public/images/reflection-v2.webp` | 生徒ホーム、キャリア画面、内省のテーマ |

### 企業の現場：最終プロンプト

Use case: photorealistic-natural. Create a wide 3:2 editorial photograph for a Japanese education and corporate curriculum platform. Scene: an authentic clean Japanese small manufacturing innovation studio with a friendly Japanese female engineer and male colleague explaining a small safe tabletop robotic gripper, recycled material samples and a paper planning sheet to a Japanese high school teacher. Adults only in this image. Natural candid collaboration, tactile materials, warm daylight, contemporary but believable workplace, muted teal and warm wood accents. Composition: people and hands centered-right with environmental context and calm left area, waist-up medium-wide framing, no screens dominating. Premium documentary photography, warm hopeful atmosphere, accurate hands, no writing, no text, no logos, no watermark, no invented brands. This is an illustrative fictional scene, not a real company endorsement.

### 越境体験：最終プロンプト

Use case: photorealistic-natural. Create a wide 3:2 editorial photograph for a Japanese high-school inquiry-learning fieldwork platform. Fictional scene: three Japanese high-school age students in modest casual outdoor clothes and one adult female teacher listen to a smiling local farmer at the edge of a vegetable field in a rural Japanese town. One student holds a small notebook and pencil, another studies imperfect vegetables in a harvest crate. Safe supervised daytime visit, small houses and lush hills softly visible, candid curiosity and conversation rather than posed smiles. Natural late summer light, teal-green and warm earth colors, premium documentary photo, wide environmental composition, faces and hands anatomically natural, no readable text, no logos, no watermark. Do not imply an actual partner, school, or event.

### 手帳での内省：最終プロンプト

Use case: illustration-story. Create a wide 3:2 warm editorial illustration for a Japanese teen student reflection and career-design page. A thoughtful Japanese teenage student seated beside a large bright window, writing their own thoughts with pencil in an open paper planner. A few small gentle vignette-like objects on the desk recall hands-on learning: a leaf, a small wooden prototype, a photograph with abstract unrecognizable landscape. Outside the window a path travels toward green hills and an open blue sky. Refined hand-painted gouache and fine pencil texture, contemporary sophisticated educational publication, restrained teal, coral and cream palette, hopeful quiet mood, spacious composition, student on right, no words, no typography, no logos, no watermark, not childish, not a UI mockup.
