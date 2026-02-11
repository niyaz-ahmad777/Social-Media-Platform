const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const bcrypt = require("bcrypt");
const db = require("./db");

const app = express();
const PORT = 3000;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(
  session({
    store: new SQLiteStore({ db: "sessions.db" }),
    secret: "change_this_secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use((req, res, next) => {
  res.locals.me = req.session.user || null;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// Home -> feed
app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.redirect("/feed");
});

// AUTH
app.get("/register", (req, res) => res.render("register", { error: null }));
app.post("/register", async (req, res) => {
  const { name, username, email, password } = req.body;
  if (!name || !username || !email || !password)
    return res.render("register", { error: "All fields required." });

  const hash = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO users (name, username, email, password_hash) VALUES (?, ?, ?, ?)",
    [name.trim(), username.trim().toLowerCase(), email.trim().toLowerCase(), hash],
    function (err) {
      if (err) return res.render("register", { error: "Email/Username already used." });
      req.session.user = { id: this.lastID, name, username: username.trim().toLowerCase() };
      res.redirect("/feed");
    }
  );
});

app.get("/login", (req, res) => res.render("login", { error: null }));
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE email = ?",
    [email.trim().toLowerCase()],
    async (err, user) => {
      if (err || !user) return res.render("login", { error: "Invalid credentials." });
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.render("login", { error: "Invalid credentials." });

      req.session.user = { id: user.id, name: user.name, username: user.username };
      res.redirect("/feed");
    }
  );
});

app.post("/logout", (req, res) => req.session.destroy(() => res.redirect("/login")));

// FEED
app.get("/feed", requireAuth, (req, res) => {
  const myId = req.session.user.id;

  const sql = `
    SELECT p.*, u.name, u.username,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) AS likeCount,
      EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.user_id=?) AS likedByMe,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) AS commentCount
    FROM posts p
    JOIN users u ON u.id=p.user_id
    ORDER BY p.created_at DESC
  `;

  db.all(sql, [myId], (err, posts) => {
    if (err) return res.status(500).send("DB error");
    res.render("feed", { posts });
  });
});

// Create post
app.post("/post", requireAuth, (req, res) => {
  const content = (req.body.content || "").trim();
  const media_url = (req.body.media_url || "").trim();
  const media_type = (req.body.media_type || "").trim(); // image/video/empty

  if (!content && !media_url) return res.redirect("/feed");

  db.run(
    "INSERT INTO posts (user_id, content, media_url, media_type) VALUES (?, ?, ?, ?)",
    [req.session.user.id, content, media_url || null, media_type || null],
    () => res.redirect("/feed")
  );
});

// Like / Unlike
app.post("/like/:postId", requireAuth, (req, res) => {
  const postId = req.params.postId;
  const userId = req.session.user.id;

  db.get("SELECT id FROM likes WHERE post_id=? AND user_id=?", [postId, userId], (err, row) => {
    if (row) {
      db.run("DELETE FROM likes WHERE post_id=? AND user_id=?", [postId, userId], () => res.json({ ok: true, liked: false }));
    } else {
      db.run("INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)", [postId, userId], () => res.json({ ok: true, liked: true }));
    }
  });
});

// Comments
app.get("/post/:id", requireAuth, (req, res) => {
  const postId = req.params.id;
  const myId = req.session.user.id;

  const postSql = `
    SELECT p.*, u.name, u.username,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) AS likeCount,
      EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.user_id=?) AS likedByMe
    FROM posts p
    JOIN users u ON u.id=p.user_id
    WHERE p.id=?
  `;

  db.get(postSql, [myId, postId], (err, post) => {
    if (err || !post) return res.redirect("/feed");

    db.all(
      `SELECT c.*, u.name, u.username
       FROM comments c
       JOIN users u ON u.id=c.user_id
       WHERE c.post_id=?
       ORDER BY c.created_at DESC`,
      [postId],
      (err2, comments) => {
        if (err2) comments = [];
        res.render("profile", { mode: "post", post, comments });
      }
    );
  });
});

app.post("/comment/:postId", requireAuth, (req, res) => {
  const postId = req.params.postId;
  const content = (req.body.content || "").trim();

  console.log("Comment:", postId, content);

  if (!content) return res.redirect("/post/" + postId);

  db.run(
    "INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
    [postId, req.session.user.id, content],
    (err) => {
      if (err) return res.redirect("/post/" + postId);
      res.redirect("/post/" + postId);
    }
  );
});

// My profile
app.get("/me", requireAuth, (req, res) => res.redirect("/u/" + req.session.user.username));

// User profile
app.get("/u/:username", requireAuth, (req, res) => {
  const username = req.params.username.toLowerCase();
  const myId = req.session.user.id;

  db.get("SELECT * FROM users WHERE username=?", [username], (err, user) => {
    if (!user) return res.redirect("/feed");

    db.get(
      "SELECT COUNT(*) as cnt FROM follows WHERE follower_id=? AND following_id=?",
      [myId, user.id],
      (err2, followRow) => {
        const isFollowing = followRow?.cnt > 0;

        db.all(
          `SELECT p.*, 
            (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) AS likeCount,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) AS commentCount
           FROM posts p WHERE p.user_id=? ORDER BY p.created_at DESC`,
          [user.id],
          (err3, posts) => {
            db.get("SELECT COUNT(*) as n FROM follows WHERE following_id=?", [user.id], (e4, followers) => {
              db.get("SELECT COUNT(*) as n FROM follows WHERE follower_id=?", [user.id], (e5, following) => {
                res.render("user", { user, posts, isFollowing, followers: followers.n, following: following.n });
              });
            });
          }
        );
      }
    );
  });
});

// Follow / Unfollow
app.post("/follow/:userId", requireAuth, (req, res) => {
  const myId = req.session.user.id;
  const targetId = parseInt(req.params.userId, 10);

  if (myId === targetId) return res.json({ ok: false });

  db.get(
    "SELECT id FROM follows WHERE follower_id=? AND following_id=?",
    [myId, targetId],
    (err, row) => {
      if (row) {
        db.run("DELETE FROM follows WHERE follower_id=? AND following_id=?", [myId, targetId], () =>
          res.json({ ok: true, following: false })
        );
      } else {
        db.run(
          "INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)",
          [myId, targetId],
          () => res.json({ ok: true, following: true })
        );
      }
    }
  );
});

app.listen(PORT, () => console.log(`✅ Running http://localhost:${PORT}`));
