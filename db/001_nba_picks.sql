-- NBA prop + game-line ledger (the shared Supabase project, shared with
-- MLB/NFL/WNBA/NHL on the 500 MB free plan — 181 MB used on 2026-10-14).
--
-- One row per PRICED (game, player, stat) and per game market (position='GAME',
-- player_id null). Unpriced projections are NOT rows here: they live in the slate
-- JSON on Drive/Blob. Estimated ~600 rows a slate, ~100k a season, ~40 MB with
-- indexes. Odds never come here — Drive holds them (gdrive:nba-research-dashboard-archive/odds).
--
-- Written by scripts/daily-predict.mjs (service role). The board never reads this
-- table directly: /api/results calls nba_results() server-side and CDN-caches the
-- ~10 KB answer, so page views cost no per-row egress.

create table if not exists public.nba_picks (
  id            bigint generated always as identity primary key,
  row_key       text not null unique,          -- game_id|player_id|stat  (GAME for game markets)
  game_date     date not null,
  game_id       text not null,
  player_id     bigint,
  player_name   text not null,
  team          text not null,                 -- for GAME rows: the home team
  opp           text not null,
  position      text,                          -- G/F/C, or GAME
  stat          text not null,                 -- pts reb ast fg3m pra stl blk dd | spread total ml  (dd: line 0.5, side over = Yes, proj = model P(DD))
  line          numeric,                       -- in the SIDE's terms for spreads
  side          text not null,                 -- over/under | home/away
  am            integer,                       -- best price on the side at freeze
  fair          numeric,                       -- no-vig consensus P(side)
  proj          numeric,                       -- model mean (margin/total for GAME)
  minutes       numeric,
  prob          numeric,                       -- model P(side)
  ev            numeric,                       -- per 1u at `am`
  score         numeric,                       -- gate score: ln(μ_model/μ_market) toward the side
  mu_market     numeric,
  n_books       smallint,
  qualifies     boolean not null default false,
  official      boolean not null default false,
  reason        text,
  gp_season     smallint,
  injury_status text,
  model_version text not null,
  odds_at       timestamptz,
  open_line     numeric,
  open_am       integer,
  open_at       timestamptz,
  actual        numeric,
  outcome       text check (outcome in ('win','loss','push','void')),
  units         numeric,
  graded_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists nba_picks_date_idx on public.nba_picks (game_date);
create index if not exists nba_picks_open_idx on public.nba_picks (game_date) where outcome is null;

create or replace function public.nba_picks_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists nba_picks_touch on public.nba_picks;
create trigger nba_picks_touch before update on public.nba_picks for each row execute function public.nba_picks_touch();

alter table public.nba_picks enable row level security;
drop policy if exists nba_picks_read on public.nba_picks;
create policy nba_picks_read on public.nba_picks for select to anon, authenticated using (true);

-- The Results tab in one call. Everything is aggregated in the database so the
-- page receives ~10 KB however long the season gets.
create or replace function public.nba_results(p_version text default null)
returns json language sql stable security invoker set search_path = public as $$
with g as (
  select * from nba_picks
  where outcome in ('win','loss','push') and am is not null
    and (p_version is null or model_version = p_version)
),
tiers as (
  select 'official' tier, * from g where official
  union all select 'qualifying', * from g where qualifies
  union all select 'all priced', * from g
)
select json_build_object(
  'asOf', now(),
  'byMarket', (select json_agg(x order by x.tier, x.stat) from (
      select tier, stat, count(*) n,
        count(*) filter (where outcome='win') w, count(*) filter (where outcome='loss') l, count(*) filter (where outcome='push') p,
        round(sum(units)::numeric, 2) units, round((sum(units) / nullif(count(*),0))::numeric, 4) roi,
        round(avg(prob)::numeric, 4) avg_prob, round(avg(case when outcome='win' then 1.0 when outcome='loss' then 0.0 end)::numeric, 4) hit,
        round(avg(fair)::numeric, 4) avg_fair,
        round(avg(case when open_am is not null and am is not null
                  then (case when open_am > 0 then 100.0/(open_am+100) else -open_am/(-open_am+100.0) end)
                     - (case when am > 0 then 100.0/(am+100) else -am/(-am+100.0) end) end)::numeric, 4) clv_prob
      from tiers group by tier, stat) x),
  'byDay', (select json_agg(x order by x.game_date) from (
      select game_date, count(*) n, round(sum(units)::numeric, 2) units,
        count(*) filter (where qualifies) nq, round(coalesce(sum(units) filter (where qualifies), 0)::numeric, 2) units_q
      from g group by game_date order by game_date desc limit 120) x),
  'edgeBands', (select json_agg(x order by x.stat, x.band) from (
      select stat, width_bucket(score, 0, 0.4, 8) band, count(*) n, round(sum(units)::numeric, 2) units,
        round(avg(case when outcome='win' then 1.0 when outcome='loss' then 0.0 end)::numeric, 4) hit
      from g where score is not null and score >= 0 group by stat, band) x),
  'calibration', (select json_agg(x order by x.bin) from (
      select width_bucket(prob, 0.4, 0.9, 10) bin, count(*) n, round(avg(prob)::numeric, 4) pred, round(avg(fair)::numeric, 4) mkt,
        round(avg(case when outcome='win' then 1.0 when outcome='loss' then 0.0 end)::numeric, 4) real
      from g group by bin) x),
  'recent', (select json_agg(x order by x.game_date desc, x.score desc) from (
      select game_date, player_name, team, opp, stat, side, line, am, prob, score, proj, actual, outcome, units, official
      from nba_picks where qualifies and game_date >= current_date - 7 order by game_date desc, score desc limit 150) x)
);
$$;
grant execute on function public.nba_results(text) to anon, authenticated;
