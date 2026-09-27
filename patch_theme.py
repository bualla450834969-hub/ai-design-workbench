import re

p = r"C:\Users\45083\Doubao\chats\2026-09-07\new-chat-2\ai-workbench\apps\web\components\SettingsPanel.tsx"
s = open(p, encoding="utf-8").read()

# 1. Add theme state
old_state = '  const [autoSave, setAutoSave] = useState(() => isAutoSaveEnabled());'
new_state = '''  const [autoSave, setAutoSave] = useState(() => isAutoSaveEnabled());
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("theme") as "dark" | "light") || "dark";
  });'''
assert old_state in s, "old_state not found"
s = s.replace(old_state, new_state, 1)

# 2. Add useEffect for theme
old_effect = '''  // 加载保存的目录名称
  useEffect(() => {
    getSavedDirectoryName().then(setSaveDirName);
  }, []);'''
new_effect = '''  // 加载保存的目录名称
  useEffect(() => {
    getSavedDirectoryName().then(setSaveDirName);
  }, []);

  // 应用主题
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);'''
assert old_effect in s, "old_effect not found"
s = s.replace(old_effect, new_effect, 1)

# 3. Add theme toggle section before "关于"
old_about = '''      <section className="glass-card rounded-2xl p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">关于</h2>'''
new_about = '''      {/* 主题切换 */}
      <section className="glass-card rounded-2xl p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">外观</h2>
        <div className="flex gap-3">
          <button
            onClick={() => setTheme("dark")}
            className={"flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all " + (theme === "dark" ? "bg-indigo-500/80 text-white" : "bg-white/5 text-white/60 hover:bg-white/10")}
          >
            🌙 暗夜模式
          </button>
          <button
            onClick={() => setTheme("light")}
            className={"flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all " + (theme === "light" ? "bg-indigo-500/80 text-white" : "bg-white/5 text-white/60 hover:bg-white/10")}
          >
            ☀️ 白日模式
          </button>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">关于</h2>'''
assert old_about in s, "old_about not found"
s = s.replace(old_about, new_about, 1)

open(p, "w", encoding="utf-8").write(s)
print("OK theme toggle added")
