import { PokemonDotSprite } from "./PokemonDotSprite";

type Mon = {
  pokemonId: number;
  form?: string;
  exact?: boolean;
  spriteSuffix?: number | null;
  shadow?: boolean;
};

const SHADOW = "/Image/sozai/shadow.png";

export function StackedMon({
  front,
  rear,
  size,
  anchorFront = false,
  onRear,
  rearLabel,
}: {
  front: Mon;
  rear: Mon | null;
  size: number;
  anchorFront?: boolean;
  onRear?: () => void;
  rearLabel?: string;
}) {
  if (!rear) {
    return (
      <span className="sim-banner-sprite">
        <PokemonDotSprite pokemonId={front.pokemonId} form={front.exact ? undefined : front.form} exact={front.exact} spriteSuffix={front.spriteSuffix} alt="" size={size} />
        {front.shadow ? <img className="sim-banner-shadow" src={SHADOW} alt="" /> : null}
      </span>
    );
  }
  const rearSize = Math.round(size * 0.7);
  const rearArt = (
    <>
      <PokemonDotSprite pokemonId={rear.pokemonId} form={rear.exact ? undefined : rear.form} exact={rear.exact} spriteSuffix={rear.spriteSuffix} alt="" size={rearSize} />
      {rear.shadow ? <img className="sim-banner-shadow" src={SHADOW} alt="" /> : null}
    </>
  );
  const rearNode = onRear ? (
    <button type="button" className="stacked-mon-rear is-switch" aria-label={rearLabel} onClick={onRear}>
      {rearArt}
    </button>
  ) : (
    <span className="stacked-mon-rear" style={anchorFront ? undefined : { width: rearSize, height: rearSize }}>
      {rearArt}
    </span>
  );
  if (anchorFront) {
    return (
      <span className="stacked-mon is-anchored" style={{ width: size, height: size }}>
        {rearNode}
        <span className="stacked-mon-front sim-banner-sprite">
          <PokemonDotSprite pokemonId={front.pokemonId} form={front.exact ? undefined : front.form} exact={front.exact} spriteSuffix={front.spriteSuffix} alt="" size={size} />
          {front.shadow ? <img className="sim-banner-shadow" src={SHADOW} alt="" /> : null}
        </span>
      </span>
    );
  }
  return (
    <span className="stacked-mon" style={{ width: Math.round(size * 1.5), height: size }}>
      {rearNode}
      <span className="stacked-mon-front sim-banner-sprite" style={{ width: size, height: size }}>
        <PokemonDotSprite pokemonId={front.pokemonId} form={front.exact ? undefined : front.form} exact={front.exact} spriteSuffix={front.spriteSuffix} alt="" size={size} />
        {front.shadow ? <img className="sim-banner-shadow" src={SHADOW} alt="" /> : null}
      </span>
    </span>
  );
}
