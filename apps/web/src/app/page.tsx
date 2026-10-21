export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-2xl bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 rounded-full mb-4">
          Phase P0 Initialized
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-3">
          Pairio-Lite "Pair Master"
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-6">
          A high-fidelity pair programming prototype featuring two human developer seats and an AI agent on the third seat facilitating AST code ownership, root-cause isolation, and visual diagrams.
        </p>
        <div className="grid grid-cols-3 gap-3 text-left">
          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
            <span className="text-xs text-slate-500 block mb-1">Seat 1</span>
            <span className="text-sm font-medium text-emerald-400">Dev A (Host)</span>
          </div>
          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
            <span className="text-xs text-slate-500 block mb-1">Seat 2</span>
            <span className="text-sm font-medium text-sky-400">Dev B (Peer)</span>
          </div>
          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
            <span className="text-xs text-slate-500 block mb-1">Seat 3</span>
            <span className="text-sm font-medium text-purple-400">Pair Master</span>
          </div>
        </div>
      </div>
    </main>
  );
}
