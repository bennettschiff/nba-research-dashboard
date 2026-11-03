-- Ledger tracking in the shape the NHL and NFL labs settled on (2026-10-15):
-- a record by day that unfolds into markets, "Where is it winning?" over EVERY
-- market / side / book / team (empty groups listed too), and a pick list that
-- owns its own filters. Still aggregated in Postgres: the page never pulls the
-- ~700 priced rows a slate writes, only the season's gate plays (~15 a night) or
-- ONE day of every priced lean, through the CDN-cached /api/picks.
--
-- Run once on the shared project BEFORE the pipeline runs a
-- daily-predict that writes `book` (its upsert fails on a missing column) and
-- before the board that reads the new nba_results() keys is deployed.

-- The book behind `am` (best price on the side at freeze). daily-predict writes it
-- from 2026-10-21's runs on; rows frozen earlier are filled from the boards
-- archived on Drive by scripts/backfill-book.mjs (all 934 matched exactly).
alter table public.nba_picks add column if not exists book text;

create index if not exists nba_picks_q_idx on public.nba_picks (game_date) where qualifies;

-- The Results tab in one call (~10-30 KB a full season: every array is
-- aggregated, day × market rows are positional).
--   byMarket / edgeBands / calibration  — as before
--   byDay      [{game_date, off, q, all}]   each record {n, w, l, p, units}
--   dayMarket  [[game_date, stat, tier, n, w, l, p, units]]  non-empty only
--   breakdown  [[tier, split, key, n, w, l, p, units]]       split ∈ market/side/book/team
--   counts     {official, qualifying, all priced}  graded + open rows, for the pick-list pills
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
),
rec as (
  select tier, game_date, stat, side, coalesce(book, '?') book, team, outcome, units from tiers
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
      select game_date,
        json_build_object('n', count(*) filter (where official), 'w', count(*) filter (where official and outcome='win'),
          'l', count(*) filter (where official and outcome='loss'), 'p', count(*) filter (where official and outcome='push'),
          'units', round(coalesce(sum(units) filter (where official), 0)::numeric, 2)) off,
        json_build_object('n', count(*) filter (where qualifies), 'w', count(*) filter (where qualifies and outcome='win'),
          'l', count(*) filter (where qualifies and outcome='loss'), 'p', count(*) filter (where qualifies and outcome='push'),
          'units', round(coalesce(sum(units) filter (where qualifies), 0)::numeric, 2)) q,
        json_build_object('n', count(*), 'w', count(*) filter (where outcome='win'),
          'l', count(*) filter (where outcome='loss'), 'p', count(*) filter (where outcome='push'),
          'units', round(sum(units)::numeric, 2)) "all"
      from g group by game_date) x),
  'dayMarket', (select json_agg(json_build_array(game_date, stat, tier, n, w, l, p, units) order by game_date, stat, tier) from (
      select game_date, stat, tier, count(*) n, count(*) filter (where outcome='win') w, count(*) filter (where outcome='loss') l,
        count(*) filter (where outcome='push') p, round(sum(units)::numeric, 2) units
      from rec group by game_date, stat, tier) x),
  'breakdown', (select json_agg(json_build_array(tier, split, key, n, w, l, p, units) order by tier, split, key) from (
      select tier, split, key, count(*) n, count(*) filter (where outcome='win') w, count(*) filter (where outcome='loss') l,
        count(*) filter (where outcome='push') p, round(sum(units)::numeric, 2) units
      from rec cross join lateral (values ('market', stat), ('side', side), ('book', book), ('team', team)) s(split, key)
      group by tier, split, key) x),
  'counts', (select json_build_object('official', count(*) filter (where official), 'qualifying', count(*) filter (where qualifies),
      'all priced', count(*)) from nba_picks where am is not null and (p_version is null or model_version = p_version)),
  'edgeBands', (select json_agg(x order by x.stat, x.band) from (
      select stat, width_bucket(score, 0, 0.4, 8) band, count(*) n, round(sum(units)::numeric, 2) units,
        round(avg(case when outcome='win' then 1.0 when outcome='loss' then 0.0 end)::numeric, 4) hit
      from g where score is not null and score >= 0 group by stat, band) x),
  'calibration', (select json_agg(x order by x.bin) from (
      select width_bucket(prob, 0.4, 0.9, 10) bin, count(*) n, round(avg(prob)::numeric, 4) pred, round(avg(fair)::numeric, 4) mkt,
        round(avg(case when outcome='win' then 1.0 when outcome='loss' then 0.0 end)::numeric, 4) real
      from g group by bin) x)
);
$$;
grant execute on function public.nba_results(text) to anon, authenticated;

-- The pick list. Official / gate plays: the whole season (~15 rows a night).
-- Every priced lean: ONE day (~700 rows) — p_date, or the latest day with rows.
-- Graded and open rows both; positional rows under `cols` to keep it small.
create or replace function public.nba_pick_list(p_tier text default 'qualifying', p_date date default null)
returns json language sql stable security invoker set search_path = public as $$
with d as (
  select coalesce(p_date, (select max(game_date) from nba_picks)) as slate_day
),
r as (
  select p.* from nba_picks p, d
  where p.am is not null
    and case p_tier when 'official' then p.official
                    when 'qualifying' then p.qualifies
                    else p.game_date = d.slate_day end
    and (p_tier = 'all priced' or p_date is null or p.game_date = p_date)
)
select json_build_object(
  'tier', p_tier,
  'date', case when p_tier = 'all priced' then (select slate_day from d) end,
  'cols', json_build_array('game_date','player_id','player_name','team','opp','position','stat','side','line','am','book',
                           'prob','fair','score','proj','actual','outcome','units','qualifies','official','injury_status'),
  'rows', coalesce((select json_agg(json_build_array(game_date, player_id, player_name, team, opp, position, stat, side, line, am, book,
                           prob, fair, score, proj, actual, outcome, units, qualifies, official, injury_status)
                    order by game_date desc, score desc nulls last) from r), '[]'::json)
);
$$;
grant execute on function public.nba_pick_list(text, date) to anon, authenticated;
