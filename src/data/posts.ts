export interface Post {
  id: string;
  title: string;
  date: string;
  read: string;
  tag: string;
  excerpt: string;
  /** Article body as HTML — rendered inside `.prose`. */
  body: string;
}

export const posts: Post[] = [
  {
    id: "raft",
    title: "A Field Guide to Raft",
    date: "2026-06-14",
    read: "12 min",
    tag: "consensus",
    excerpt:
      'Consensus is not a black box labeled "just use Raft." Here are the parts that actually bite — terms, commit rules, and the invariants you only learn about at 3am.',
    body: `
      <p>Every distributed system eventually runs into the same wall: a set of machines needs to agree on a single value, and the network refuses to cooperate. Packets drop, nodes pause for garbage collection, and clocks drift. The whole point of a consensus protocol is to let a cluster keep making progress <em>anyway</em> — as long as a majority of nodes are alive and can talk to each other.</p>
      <p>The trap most engineers fall into is treating consensus as a black box labeled "just use Raft." It works, right up until it doesn't, and then you're staring at a stalled cluster at 3am with no idea which invariant you violated.</p>

      <h2># terms are the real clock</h2>
      <p>Forget wall-clock time. In Raft, the only clock that matters is the <strong>term</strong> — a monotonically increasing integer that fences off one leader's reign from the next. Every message carries a term, and any node that sees a higher term immediately steps down.</p>

      <div class="code-window">
        <div class="code-window__bar">
          <span class="dot dot--sm dot--red"></span>
          <span class="dot dot--sm dot--yellow"></span>
          <span class="dot dot--sm dot--green"></span>
          <span class="code-window__name">append_entries.go</span>
        </div>
        <div class="code-window__body"><span class="c">// reject anything from a stale leader</span><br />
<span class="k">if</span> req.term &lt; currentTerm {<br />
&nbsp;&nbsp;<span class="k">return</span> Reply{ term: currentTerm, success: <span class="k">false</span> }<br />
}<br />
<span class="k">if</span> req.term &gt; currentTerm {<br />
&nbsp;&nbsp;currentTerm = req.term<br />
&nbsp;&nbsp;becomeFollower()<br />
}</div>
      </div>

      <blockquote>A leader is only a leader for the entries it can prove a majority already has. Everything else is optimism.</blockquote>

      <h2># commit is a majority, not an ack</h2>
      <p>The subtlest bug I've shipped came from conflating "the leader wrote it locally" with "the entry is committed." An entry is committed only once it's durably stored on a majority of the cluster — and a leader may only mark entries from its <em>own</em> term as committed by counting replicas.</p>
      <p>Skip that rule and you can lose an acknowledged write during a leader change. That's the difference between a database and a very fast way to corrupt data.</p>

      <h2># where to go next</h2>
      <p>If you only internalize one thing: consensus buys you a replicated <em>log</em>, not a replicated database. The state machine on top is your problem. Get the log right and everything above it becomes a much more pleasant kind of hard.</p>
    `,
  },
  {
    id: "lsm",
    title: "LSM-Trees vs B-Trees, Honestly",
    date: "2026-05-02",
    read: "9 min",
    tag: "storage",
    excerpt:
      "Write amplification, read amplification, space amplification — you only get to optimize two. A practical guide to picking a storage engine without the vendor hand-waving.",
    body: `
      <p>Storage-engine debates get religious fast, but the honest version fits on an index card. There are three costs — write amplification, read amplification, and space amplification — and no design lets you minimize all three at once. Pick the two that matter for your workload and accept the third.</p>

      <h2># the RUM conjecture in practice</h2>
      <p>B-trees update in place, so a point read is a handful of page fetches and space overhead is low. The price is write amplification: every update dirties a full page, and random writes thrash your disk. LSM-trees flip this. Writes land in a memtable and get flushed sequentially, which is beautiful for ingest — but reads may have to check several levels, and compaction rewrites data over and over.</p>

      <blockquote>Benchmarks lie by omission. Ask what the write pattern was, how full the dataset was, and whether compaction had caught up.</blockquote>

      <h2># choosing on purpose</h2>
      <p>Write-heavy, append-mostly, time-series shaped? Reach for an LSM engine and tune compaction. Read-heavy with hot random point lookups and tight latency SLOs? A B-tree will usually treat you better. The wrong move is picking based on which database has the nicer landing page.</p>
      <p>Whatever you choose, measure at steady state — after compaction has run and the cache is warm. The first ten minutes of a benchmark tell you almost nothing about the next ten months.</p>
    `,
  },
  {
    id: "txn",
    title: "The Hidden Cost of Distributed Transactions",
    date: "2026-04-18",
    read: "11 min",
    tag: "transactions",
    excerpt:
      'Two-phase commit feels free in the happy path. Then a coordinator dies mid-prepare and you learn exactly what "blocking protocol" means.',
    body: `
      <p>Two-phase commit is one of those ideas that looks trivial on a whiteboard. The coordinator asks every participant to prepare, everyone votes yes, the coordinator says commit, done. The happy path is so clean that it's easy to ship it and move on.</p>
      <p>Then production happens. A participant votes yes, moves into the prepared state — holding locks — and waits for the decision. The coordinator picks that exact moment to crash. Now the participant is stuck: it can't commit without permission and can't abort without risking a split decision. It holds those locks until the coordinator comes back. That's what "blocking protocol" means, and it's not in the diagram.</p>

      <h2># prepared is the dangerous state</h2>
      <p>The prepared window is where all the pain lives. Every millisecond a participant spends prepared is a millisecond of held locks and blocked throughput. Shrinking that window — faster coordinators, tighter timeouts, fewer participants — buys you more than any clever optimization elsewhere.</p>

      <blockquote>2PC doesn't remove failure. It concentrates it into the coordinator and dares you to keep that node alive.</blockquote>

      <h2># when to just say no</h2>
      <p>Often the right answer is to not need a distributed transaction at all: co-locate the data that changes together, or restructure the operation as an idempotent saga you can retry. A protocol that blocks on a single point of failure should be a last resort, not a default.</p>
    `,
  },
  {
    id: "idem",
    title: "Building an Idempotent Write Path",
    date: "2026-03-09",
    read: "7 min",
    tag: "reliability",
    excerpt:
      "Retries are inevitable, so exactly-once is a lie you implement with idempotency keys. A pattern for making duplicate writes boring.",
    body: `
      <p>"Exactly-once delivery" is marketing. Networks time out, clients retry, and the same request arrives twice. What you can actually build is exactly-once <em>effect</em> — and the tool for that is an idempotency key attached to every mutating request.</p>

      <h2># the key is a promise</h2>
      <p>The client generates a unique key per logical operation and sends it with the write. The server records the key alongside the result of the first execution. If the same key shows up again, you return the stored result instead of doing the work twice.</p>

      <div class="code-window">
        <div class="code-window__bar">
          <span class="dot dot--sm dot--red"></span>
          <span class="dot dot--sm dot--yellow"></span>
          <span class="dot dot--sm dot--green"></span>
          <span class="code-window__name">write_path.sql</span>
        </div>
        <div class="code-window__body"><span class="c">-- one row per idempotency key, uniqueness enforced by the DB</span><br />
<span class="k">INSERT INTO</span> requests (key, status)<br />
<span class="k">VALUES</span> ($1, 'in_progress')<br />
<span class="k">ON CONFLICT</span> (key) <span class="k">DO NOTHING</span><br />
<span class="k">RETURNING</span> id;</div>
      </div>

      <p>The uniqueness constraint is doing the real work here. If the insert conflicts, another attempt already owns this key — you wait for or return its result rather than racing it. Make the key's lifetime long enough to outlive any retry window, and duplicate writes become the most boring part of your system.</p>
    `,
  },
  {
    id: "lag",
    title: "Debugging Replication Lag at 3AM",
    date: "2026-02-21",
    read: "6 min",
    tag: "ops",
    excerpt:
      "A war story about a replica that fell an hour behind, the single long transaction that caused it, and the dashboard that should have caught it.",
    body: `
      <p>The page said a read replica was an hour behind primary. Reads were served stale, a downstream job was making decisions on old data, and nobody could see why — CPU was low, disk was idle, network was fine. A healthy-looking replica falling steadily further behind.</p>

      <h2># apply is single-threaded until it isn't</h2>
      <p>The culprit was one enormous transaction on the primary — a batch job updating millions of rows in a single statement. On the primary it ran in parallel across cores. On the replica, the replay stream applied it as one indivisible unit, and everything queued behind it. The lag wasn't a symptom; it was the replica faithfully doing exactly what it was told, slowly.</p>

      <blockquote>Replication lag is rarely about the replica. It's about the shape of the writes you send it.</blockquote>

      <h2># the dashboard that should have existed</h2>
      <p>We were graphing lag in seconds, which told us <em>that</em> we were behind but nothing about <em>why</em>. The fix was a panel showing the largest in-flight transaction by row count. Chunk the batch job into thousands of small commits and the replica keeps pace. The real lesson: monitor the cause, not just the effect.</p>
    `,
  },
  {
    id: "vclock",
    title: "Vector Clocks Without the Hand-Waving",
    date: "2026-01-11",
    read: "10 min",
    tag: "theory",
    excerpt:
      "Happens-before, concurrency, and conflict detection explained with a worked example instead of a wall of subscripts.",
    body: `
      <p>Vector clocks get taught as a wall of subscripts, which is a shame, because the idea is simple: give every node a counter, ship the whole vector with each message, and you can tell — precisely — whether one event happened before another or the two are genuinely concurrent.</p>

      <h2># the two rules</h2>
      <p>Each node keeps a vector of counters, one slot per node. On a local event, a node bumps its own slot. On receiving a message, it takes the element-wise max of its vector and the sender's, then bumps its own slot again. That's the entire algorithm.</p>
      <p>To compare two events, compare their vectors element by element. If every entry of A is ≤ B (and they differ), A <em>happened-before</em> B. If neither dominates the other, the events are <strong>concurrent</strong> — and concurrency is exactly the signal you need to detect a write conflict.</p>

      <blockquote>A vector clock doesn't resolve conflicts. It tells you, without guessing, that a conflict exists.</blockquote>

      <h2># where it pays off</h2>
      <p>Dynamo-style stores use this to keep sibling versions instead of silently overwriting. When two vectors are concurrent, the system hands both values back to the application and lets it merge them. No wall clock, no lost writes, no pretending time is a total order when it isn't.</p>
    `,
  },
];

export function getPost(id: string): Post | undefined {
  return posts.find((p) => p.id === id);
}
