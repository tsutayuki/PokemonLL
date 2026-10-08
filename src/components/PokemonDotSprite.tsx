import React from "react";
import { pokemonDotSpriteSize, pokemonSpriteCandidates } from "../lib/pogo/pokemonSprite";

type PokemonDotSpriteProps = {
  pokemonId: number;
  alt: string;
  size?: number;
  className?: string;
  form?: string;
  exact?: boolean;
  spriteSuffix?: number | null;
};

export function PokemonDotSprite({
  pokemonId,
  alt,
  size = 40,
  className,
  form,
  exact,
  spriteSuffix,
}: PokemonDotSpriteProps) {
  const candidates = pokemonSpriteCandidates(pokemonId, form, { exact, suffix: spriteSuffix });
  const key = candidates.join("|");
  const intrinsic = pokemonDotSpriteSize();
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setIndex(0);
  }, [key]);

  const src = candidates[Math.min(index, candidates.length - 1)] ?? candidates[0];

  return (
    <img
      className={className ? `pokemon-dot-sprite ${className}` : "pokemon-dot-sprite"}
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      style={{ width: size, height: size }}
      data-intrinsic-size={intrinsic}
      onError={() => {
        setIndex((current) => (current < candidates.length - 1 ? current + 1 : current));
      }}
    />
  );
}
