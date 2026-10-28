import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './data/client';
import { cloudRepository, type Repository } from './data/repository';
import { createPreviewRepository } from './data/preview';
import { EMPTY_DATA, type DataSet, type SessionKind } from './domain/types';
import { dailyNutritionTarget, localDate } from './domain/calculations';
import { Card, type RunAction } from './components/shared';
import { Dashboard } from './pages/Dashboard';
import { WorkoutPage } from './pages/WorkoutPage';
import { DietPage } from './pages/DietPage';
import { FoodsPage } from './pages/FoodsPage';
import { ProfilePage } from './pages/ProfilePage';
import { HistoryPage } from './pages/HistoryPage';
import { CardioPage } from './pages/CardioPage';
import { NotesPage } from './pages/NotesPage';
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })));
type Page =
  'home' | 'workout' | 'diet' | 'foods' | 'history' | 'stats' | 'profile' | 'cardio' | 'notes';
const PAGES: [Page, string, string][] = [
  ['home', '首页', '◉'],
  ['workout', '训练', '↗'],
  ['cardio', '有氧', '◴'],
  ['notes', '训练备注', '✎'],
  ['diet', '饮食', '◷'],
  ['foods', '食品库', '▤'],
  ['history', '历史', '▦'],
  ['stats', '趋势', '⌁'],
  ['profile', '设置', '⚙'],
];
export default function App() {
  const [demo] = useState(() => new URLSearchParams(location.search).get('demo') === '1');
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(!demo && configured);
  const [authError, setAuthError] = useState('');
  useEffect(() => {
    if (demo || !supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        setSession(data.session);
        setAuthError(error?.message ?? '');
        setAuthLoading(false);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) {
        setSession(next);
        setAuthLoading(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [demo]);
  if (authLoading)
    return (
      <main className="login-shell">
        <p role="status">正在检查登录状态…</p>
      </main>
    );
  if (!configured && !demo)
    return (
      <main className="login-shell">
        <Card title="欢迎使用 Sport Plan">
          <p>连接云端数据库后，即可在手机与电脑记录同一套数据。</p>
          <ol className="setup-list">
            <li>创建 Supabase 项目，执行仓库中的数据库迁移脚本。</li>
            <li>在 Supabase 后台创建你的唯一登录账号，并关闭公开注册。</li>
            <li>复制 .env.example 为 .env，填写项目 URL 与公共密钥。</li>
            <li>重新运行应用。部署步骤见 README。</li>
          </ol>
          <a className="button" href="?demo=1">
            打开临时功能预览
          </a>
          <p className="hint">预览只使用内存示例数据，刷新后重置。实际使用必须连接 Supabase。</p>
        </Card>
      </main>
    );
  if (!demo && !session) return <Login initialError={authError} />;
  return <Tracker key={demo ? 'preview' : session!.user.id} demo={demo} />;
}
function Login({ initialError }: { initialError: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  return (
    <main className="login-shell">
      <p className="brand">
        SPORT <span>PLAN</span>
      </p>
      <Card title="登录你的记录空间">
        <p className="muted">手机与电脑，共享每天的积累。</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const result = await supabase!.auth.signInWithPassword({ email, password });
              if (result.error) throw result.error;
            } catch (err) {
              setError(err instanceof Error ? err.message : '登录失败');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            邮箱
            <input
              type="email"
              autoComplete="username"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy}>{busy ? '正在登录…' : '登录'}</button>
        </form>
        <p className="hint">
          没有注册入口。请在 Supabase 后台创建个人账号；忘记密码时也在后台重置。
        </p>
      </Card>
    </main>
  );
}
function Tracker({ demo }: { demo: boolean }) {
  const [repository] = useState<Repository>(() =>
    demo ? createPreviewRepository() : cloudRepository,
  );
  const [data, setData] = useState<DataSet>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState<Page>('home');
  const [cardioEditId, setCardioEditId] = useState<string>();
  const [date, setDate] = useState(localDate());
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef<Promise<void> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [syncedAt, setSyncedAt] = useState('');
  const dirtyRef = useRef(false);
  const [dark, setDark] = useState(() => localStorage.getItem('sport-plan-theme') === 'dark');
  const refresh = useCallback(async () => {
    if (refreshingRef.current) return refreshingRef.current;
    setRefreshing(true);
    const task = (async () => {
      try {
        const next = await repository.load();
        setData(next);
        setLoaded(true);
        setSyncedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      } finally {
        refreshingRef.current = null;
        setRefreshing(false);
      }
    })();
    refreshingRef.current = task;
    return task;
  }, [repository]);
  useEffect(() => {
    let active = true;
    const sync = () => {
      if (active && !actionLock.current)
        void refresh().catch((e) => {
          if (active) setError(e instanceof Error ? e.message : '读取失败');
        });
    };
    sync();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') sync();
    }, 60000);
    const visibility = () => {
      if (document.visibilityState === 'visible') sync();
    };
    const network = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) sync();
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
    };
  }, [refresh]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('sport-plan-theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timeout);
  }, [message]);
  const run: RunAction = async (action, success = '已保存') => {
    if (actionLock.current) return false;
    actionLock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!demo && !navigator.onLine)
        throw new Error('当前离线，无法保存到云端。请恢复网络后重试。');
      // Finish any previous read before mutation, so a stale response cannot overwrite saved state.
      if (refreshingRef.current) await refreshingRef.current;
      await action();
      setMessage(success);
      try {
        await refresh();
      } catch {
        setError('操作已成功，但刷新失败。请点击刷新读取最新数据，不要重复提交。');
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请重试');
      return false;
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  function canLeave() {
    if (!dirtyRef.current) return true;
    if (!window.confirm('训练有未保存的修改，确定放弃？')) return false;
    dirtyRef.current = false;
    return true;
  }
  function navigate(next: Page) {
    if (next !== page && canLeave()) {
      if (next === 'cardio') setCardioEditId(undefined);
      setPage(next);
      setMessage('');
      window.scrollTo(0, 0);
    }
  }
  function selectDate(next: string) {
    if (next && next !== date && canLeave()) setDate(next);
  }
  function openTraining(kind: SessionKind, id: string, recordDate: string) {
    if (!canLeave()) return;
    setDate(recordDate);
    setPage(kind === 'strength' ? 'workout' : 'cardio');
    setCardioEditId(kind === 'cardio' ? id : undefined);
    setMessage('');
    window.scrollTo(0, 0);
  }
  const target = dailyNutritionTarget(data, date);
  const props = { data, repository, run, busy };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate('home');
          }}
        >
          SPORT <span>PLAN</span>
        </a>
        <p className="sidebar-caption">你的训练与饮食手账</p>
        <nav aria-label="主导航">
          {PAGES.map(([key, label, icon]) => (
            <button
              key={key}
              disabled={busy}
              aria-current={page === key ? 'page' : undefined}
              className={page === key ? 'active' : ''}
              onClick={() => navigate(key)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <small>一点积累，长久改变。</small>
          <button className="text-button" onClick={() => setDark(!dark)}>
            {dark ? '☀ 浅色模式' : '☾ 深色模式'}
          </button>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">PERSONAL TRAINING JOURNAL</p>
            <h2>{PAGES.find((p) => p[0] === page)![1]}</h2>
          </div>
          <div className="topbar-actions">
            <label className="date-control">
              记录日期
              <input
                aria-label="记录日期"
                disabled={busy}
                type="date"
                value={date}
                required
                onChange={(e) => selectDate(e.target.value)}
              />
            </label>
            <button className="secondary" disabled={busy} onClick={() => selectDate(localDate())}>
              今天
            </button>
          </div>
        </header>
        <div className="sync-bar">
          <span>
            {demo
              ? '临时预览 · 数据刷新后重置，不会云端同步'
              : `${online ? '云端连接' : '离线'}${syncedAt ? ` · 最近读取 ${syncedAt}` : ''}`}
          </span>
          <div className="actions">
            <button
              className="text-button"
              aria-label={dark ? '切换浅色模式' : '切换深色模式'}
              onClick={() => setDark(!dark)}
            >
              {dark ? '浅色' : '深色'}
            </button>
            <button
              className="text-button"
              disabled={refreshing || busy}
              onClick={() => {
                setError('');
                void refresh().catch((e) => setError(e.message));
              }}
            >
              {refreshing ? '读取中…' : '刷新'}
            </button>
            {!demo && (
              <button
                className="text-button"
                onClick={() => {
                  if (canLeave())
                    void run(async () => {
                      const result = await supabase!.auth.signOut();
                      if (result.error) throw result.error;
                    }, '已退出');
                }}
              >
                退出
              </button>
            )}
          </div>
        </div>
        {demo && (
          <div className="notice">
            预览中的训练、食品和身体信息都是示例。实际使用请完成 README 中的云端配置。
          </div>
        )}
        {!online && (
          <div className="notice error">
            当前没有网络。已加载记录可查看；保存需要联网。训练输入不会自动丢弃。
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button className="text-button" onClick={() => setError('')}>
              关闭提示
            </button>
          </div>
        )}
        {message && (
          <div className="notice success" role="status">
            {message}
          </div>
        )}
        {!loaded ? (
          <Card title="正在读取数据">
            <p>首次使用需要先配置数据库。读取失败时可点击上方刷新重试。</p>
          </Card>
        ) : (
          <fieldset className="page-fieldset" disabled={busy} aria-busy={busy}>
            {page === 'home' && (
              <Dashboard data={data} date={date} target={target} navigate={navigate} />
            )}
            {page === 'workout' && (
              <WorkoutPage
                key={date}
                {...props}
                date={date}
                onDirty={(dirty) => {
                  dirtyRef.current = dirty;
                }}
              />
            )}
            {page === 'cardio' && (
              <CardioPage
                key={`${date}:${cardioEditId ?? ''}`}
                {...props}
                date={date}
                initialId={cardioEditId}
              />
            )}
            {page === 'notes' && <NotesPage {...props} openTraining={openTraining} />}
            {page === 'diet' && <DietPage key={date} {...props} date={date} target={target} />}
            {page === 'foods' && <FoodsPage {...props} />}
            {page === 'history' && (
              <HistoryPage
                data={data}
                date={date}
                target={target}
                selectDate={selectDate}
                navigate={navigate}
                openCardio={(id) => openTraining('cardio', id, date)}
              />
            )}
            {page === 'stats' && (
              <Suspense fallback={<p>正在加载趋势图…</p>}>
                <StatsPage data={data} />
              </Suspense>
            )}
            {page === 'profile' && <ProfilePage {...props} />}
          </fieldset>
        )}
        <footer className="disclaimer">
          以上数据仅作为日常健身与饮食记录参考，并非专业医疗或营养建议。
        </footer>
      </main>
    </div>
  );
}
