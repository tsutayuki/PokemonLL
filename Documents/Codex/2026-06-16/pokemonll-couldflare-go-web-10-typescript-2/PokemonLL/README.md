# PokemonLL

ポケモンGOバトル研究用の仲間内Webアプリケーションです。まずはCloudflare Pagesで無料運用しやすい静的フロントエンドとして構成しています。

## Commands

```bash
npm install
npm run generate:pokemon-names
npm run dev
npm run build
```

## Structure

- `src/app/`: app bootstrap and route switching
- `src/features/home/`: home screen
- `src/features/iv-research/`: individual research page
- `src/lib/pogo/`: shared Pokemon GO domain logic and generated name map
- `scripts/`: data-generation scripts

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
