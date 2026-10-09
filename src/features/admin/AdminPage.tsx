import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import type { PvpMove } from "../../lib/pogo/combat";
import { learnsetKey, loadMoveEdits, saveMoveEdits } from "../../lib/pogo/moveEdits";
import { findPvpPokemon, type PvpBundle, type PvpPokemonRecord } from "../../lib/pogo/pvpBundle";
import { speciesDisplayName, type SpeciesGroup } from "../../lib/pogo/research";
import { useResearchData } from "../shared/useResearchData";
import { openPokemonSearch } from "../shared/pokemonSearchApi";
import { MoveSearchDialog } from "./MoveSearchDialog";

const ADMIN_SESSION = "pokemonll.admin.v1";
const SAVED_TEXT = "この端末に保存しました。GitHubへの送信はまだ繋がっていません。";

type TabId = "pokemon" | "move";
type MoveKind = "fast" | "charged";

type PickedPokemon = {
  pokemonId: number;
  form: string;
  label: string;
  exactSprite: boolean;
  spriteSuffix: number | null;
};

export function AdminPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(ADMIN_SESSION) === "1");

  if (!authed) {
    return <PasswordGate onEnter={() => setAuthed(true)} />;
  }

  return <DataDesk onLogout={() => setAuthed(false)} />;
}

function PasswordGate({ onEnter }: { onEnter: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="page-iv">
      <div className="page-heading">
        <a className="btn btn-secondary btn-back" href="#/">
          <ArrowLeft size={16} />
          ホーム
        </a>
        <div>
          <h1>管理者ログイン</h1>
          <p className="page-lead">通ると、技の数値と覚える技を直せます。</p>
        </div>
      </div>
      <form
        className="panel admin-login"
        onSubmit={(event) => {
          event.preventDefault();
          if (password === "") {
            sessionStorage.setItem(ADMIN_SESSION, "1");
            setError("");
            onEnter();
            return;
          }
          setError("パスワードが違います");
        }}
      >
        <label className="field">
          <span className="field-label">パスワード</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError("");
            }}
          />
        </label>
        <p className="note">いまのパスワードは空です。何も入れずに入室できます。</p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary">
          入室
        </button>
      </form>
    </div>
  );
}

function DataDesk({ onLogout }: { onLogout: () => void }) {
  const { data, error, reload } = useResearchData();
  const [tab, setTab] = useState<TabId>("pokemon");
  const [editTick, setEditTick] = useState(0);
  const edits = useMemo(() => loadMoveEdits(), [editTick]);
  const moveCount = Object.keys(edits.moves).length;
  const learnCount = Object.keys(edits.learnsets).length;

  return (
    <div className="page-iv">
      <div className="page-heading">
        <a className="btn btn-secondary btn-back" href="#/">
          <ArrowLeft size={16} />
          ホーム
        </a>
        <div className="admin-heading-row">
          <div>
            <h1>データ管理</h1>
            <p className="page-lead">技の数値と、各ポケモンが覚える技を直します。保存はこの端末に残り、シミュレーターの計算に入ります。</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              sessionStorage.removeItem(ADMIN_SESSION);
              onLogout();
            }}
          >
            ログアウト
          </button>
        </div>
      </div>

      <p className="note">
        この端末に残している変更は、技{moveCount}件、ポケモン{learnCount}件です。GitHubへの送信はまだ繋がっていません。
      </p>

      {error ? (
        <section className="panel">
          <h2 className="panel-title">データを読み込めませんでした</h2>
          <p className="page-lead">{error}</p>
          <button type="button" className="btn btn-primary" onClick={reload}>
            再読み込み
          </button>
        </section>
      ) : null}

      {!data && !error ? (
        <section className="panel" aria-busy="true">
          <p className="page-lead">研究データを読み込み中です。</p>
        </section>
      ) : null}

      {data ? (
        <div className={`folder is-${tab}`}>
          <div className="folder-tabs" role="tablist" aria-label="管理するデータ">
            <button
              type="button"
              role="tab"
              id="tab-pokemon"
              className={tab === "pokemon" ? "folder-tab is-active" : "folder-tab"}
              aria-selected={tab === "pokemon"}
              aria-controls="panel-pokemon"
              onClick={() => setTab("pokemon")}
            >
              ポケモン
            </button>
            <button
              type="button"
              role="tab"
              id="tab-move"
              className={tab === "move" ? "folder-tab is-active" : "folder-tab"}
              aria-selected={tab === "move"}
              aria-controls="panel-move"
              onClick={() => setTab("move")}
            >
              技
            </button>
          </div>
          <div className="folder-body">
            <div role="tabpanel" id="panel-pokemon" aria-labelledby="tab-pokemon" hidden={tab !== "pokemon"}>
              <PokemonEditor bundle={data.bundle} onSaved={() => setEditTick((value) => value + 1)} />
            </div>
            <div role="tabpanel" id="panel-move" aria-labelledby="tab-move" hidden={tab !== "move"}>
              <MoveEditor moves={Object.values(data.bundle.moves)} onSaved={() => setEditTick((value) => value + 1)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PokemonEditor({ bundle, onSaved }: { bundle: PvpBundle; onSaved: () => void }) {
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;
  const [picked, setPicked] = useState<PickedPokemon | null>(null);
  const [target, setTarget] = useState<PvpPokemonRecord | null>(null);
  const [fast, setFast] = useState<string[]>([]);
  const [charged, setCharged] = useState<string[]>([]);
  const [addKind, setAddKind] = useState<MoveKind | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ kind: MoveKind; id: string } | null>(null);
  const [status, setStatus] = useState("");
  const pickedKey = picked ? `${picked.pokemonId}:${picked.form}` : "";
  const ready = Boolean(bundle);

  useEffect(() => {
    const current = bundleRef.current;
    if (!picked || !current) {
      setTarget(null);
      setFast([]);
      setCharged([]);
      return;
    }
    const record = findPvpPokemon(current, picked.pokemonId, picked.form);
    setTarget(record);
    setFast(record ? [...record.fast] : []);
    setCharged(record ? [...record.charged] : []);
    setStatus("");
  }, [picked, pickedKey, ready]);

  const moves = bundle.moves;
  const removeName = pendingRemove ? (moves[pendingRemove.id]?.name ?? pendingRemove.id) : "";

  function addMove(move: PvpMove) {
    const kind = addKind;
    setAddKind(null);
    if (!kind) return;
    const list = kind === "fast" ? fast : charged;
    if (list.includes(move.id)) {
      setStatus(`「${move.name}」はすでに入っています。`);
      return;
    }
    if (kind === "fast") setFast([...fast, move.id]);
    else setCharged([...charged, move.id]);
    setStatus(`「${move.name}」を追加しました。下の保存でこの端末に残します。`);
  }

  function confirmRemove() {
    if (!pendingRemove) return;
    const { kind, id } = pendingRemove;
    if (kind === "fast") setFast(fast.filter((item) => item !== id));
    else setCharged(charged.filter((item) => item !== id));
    setPendingRemove(null);
    setStatus(`「${removeName}」を外しました。下の保存でこの端末に残します。`);
  }

  return (
    <div className="admin-editor">
      <p className="note">×で外す前に確認します。＋追加は、その列の技だけを検索します。履歴は出しません。</p>
      <button
        type="button"
        className="identity-pick"
        onClick={() => {
          openPokemonSearch((group: SpeciesGroup) => {
            const entry = group.entries[0];
            if (!entry) return;
            setPicked({
              pokemonId: entry.pokemon_id,
              form: entry.form,
              label: speciesDisplayName(group),
              exactSprite: Boolean(group.exactSprite),
              spriteSuffix: group.spriteSuffix ?? null,
            });
          });
        }}
      >
        {picked ? (
          <PokemonDotSprite
            pokemonId={picked.pokemonId}
            form={picked.exactSprite ? undefined : picked.form}
            exact={picked.exactSprite}
            spriteSuffix={picked.spriteSuffix}
            alt=""
            size={52}
          />
        ) : (
          <img className="pokemon-dot-sprite" src="/Image/sprite/Question_Mark.png" alt="" width={52} height={52} />
        )}
        <span>
          <span className="identity-pick-name">{picked ? picked.label : "ポケモンを検索"}</span>
          <span className="note">{picked ? "押すと入れ替え" : "個体値と同じ検索です"}</span>
        </span>
      </button>

      {picked && !target ? <p className="note">このポケモンの技表がデータに無いので、保存できません。</p> : null}
      {picked && target && target.form !== picked.form ? (
        <p className="note">このフォルム専用の技表が無いので、近いフォルムの覚える技を編集しています。</p>
      ) : null}

      {target ? (
        <div className="move-columns">
          <MoveColumn
            title="ノーマルアタック"
            ids={fast}
            moves={moves}
            onRemove={(id) => setPendingRemove({ kind: "fast", id })}
            onAdd={() => setAddKind("fast")}
          />
          <MoveColumn
            title="スペシャルアタック"
            ids={charged}
            moves={moves}
            onRemove={(id) => setPendingRemove({ kind: "charged", id })}
            onAdd={() => setAddKind("charged")}
          />
        </div>
      ) : null}

      {status ? (
        <p className="note" role="status">
          {status}
        </p>
      ) : null}

      <button
        type="button"
        className="btn btn-primary admin-save"
        onClick={() => {
          if (!target) {
            setStatus(picked ? "このポケモンの技表が無いので、保存できません。" : "先にポケモンを検索してください。");
            return;
          }
          const store = loadMoveEdits();
          store.learnsets[learnsetKey(target.pokemonId, target.form)] = {
            fast: [...fast],
            charged: [...charged],
          };
          saveMoveEdits(store);
          setStatus(SAVED_TEXT);
          onSaved();
        }}
      >
        保存
      </button>

      <MoveSearchDialog
        open={addKind !== null}
        moves={Object.values(moves)}
        kind={addKind}
        onClose={() => setAddKind(null)}
        onSelect={addMove}
      />
      <ConfirmDialog
        open={pendingRemove !== null}
        message={`「${removeName}」を覚え技から外しますか？`}
        confirmLabel="外す"
        onCancel={() => setPendingRemove(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

function MoveColumn({
  title,
  ids,
  moves,
  onRemove,
  onAdd,
}: {
  title: string;
  ids: string[];
  moves: Record<string, PvpMove>;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="move-column">
      <h2 className="panel-title">{title}</h2>
      <ul className="move-edit-list">
        {ids.map((id) => {
          const name = moves[id]?.name ?? id;
          return (
            <li key={id}>
              <span>{name}</span>
              <button type="button" className="move-remove" aria-label={`${name}を外す`} onClick={() => onRemove(id)}>
                ×
              </button>
            </li>
          );
        })}
        <li>
          <button type="button" className="move-add" onClick={onAdd}>
            ＋追加
          </button>
        </li>
      </ul>
    </section>
  );
}

function MoveEditor({ moves, onSaved }: { moves: PvpMove[]; onSaved: () => void }) {
  const movesRef = useRef(moves);
  movesRef.current = moves;
  const [pickedId, setPickedId] = useState("");
  const [open, setOpen] = useState(false);
  const [power, setPower] = useState("");
  const [second, setSecond] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const ready = moves.length > 0;

  const picked = moves.find((move) => move.id === pickedId) ?? null;

  useEffect(() => {
    const move = movesRef.current.find((item) => item.id === pickedId);
    if (!move) return;
    setPower(String(move.power));
    setSecond(String(move.kind === "fast" ? move.energyGain : move.energy));
    setStatus("");
    setError("");
  }, [pickedId, ready]);

  const secondLabel = picked?.kind === "fast" ? "チャージ量" : "ゲージ消費量";

  return (
    <div className="admin-editor">
      <p className="note">ノーマルアタックは威力とチャージ量、スペシャルアタックは威力とゲージ消費量です。入っている値を入れ直して保存します。</p>
      <button type="button" className="identity-pick is-text" onClick={() => setOpen(true)}>
        <span>
          <span className="identity-pick-name">{picked ? picked.name : "技を検索"}</span>
          <span className="note">
            {picked ? (picked.kind === "fast" ? "ノーマルアタック" : "スペシャルアタック") : "履歴は出しません"}
          </span>
        </span>
      </button>

      {picked ? (
        <div className="admin-stat-fields">
          <label className="field">
            <span className="field-label">威力</span>
            <input className="input" inputMode="numeric" value={power} onChange={(event) => setPower(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{secondLabel}</span>
            <input className="input" inputMode="numeric" value={second} onChange={(event) => setSecond(event.target.value)} />
          </label>
        </div>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="note" role="status">
          {status}
        </p>
      ) : null}

      <button
        type="button"
        className="btn btn-primary admin-save"
        onClick={() => {
          if (!picked) {
            setError("");
            setStatus("先に技を検索してください。");
            return;
          }
          const powerValue = parseWhole(power);
          const secondValue = parseWhole(second);
          if (powerValue === null || secondValue === null) {
            setError("威力と、その横の数値を、0以上の整数で入れてください。");
            setStatus("");
            return;
          }
          const store = loadMoveEdits();
          const prev = store.moves[picked.id] ?? {};
          store.moves[picked.id] =
            picked.kind === "fast"
              ? { ...prev, power: powerValue, energyGain: secondValue }
              : { ...prev, power: powerValue, energy: secondValue };
          saveMoveEdits(store);
          setError("");
          setStatus(SAVED_TEXT);
          onSaved();
        }}
      >
        保存
      </button>

      <MoveSearchDialog
        open={open}
        moves={moves}
        kind={null}
        onClose={() => setOpen(false)}
        onSelect={(move) => {
          setPickedId(move.id);
          setOpen(false);
        }}
      />
    </div>
  );
}

function ConfirmDialog({
  open,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div className="search-overlay confirm-overlay" role="dialog" aria-modal="true" aria-label="確認">
      <button type="button" className="search-overlay-backdrop" aria-label="閉じる" onClick={onCancel} />
      <div className="confirm-panel">
        <p>{message}</p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function parseWhole(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}
