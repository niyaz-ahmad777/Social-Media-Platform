const bcrypt = require("bcrypt");
const db = require("./db");

async function run() {
  const pass = await bcrypt.hash("123456", 10);

  const demoUsers = [
    { name: "Salman Fan Page (Demo)", username: "salman_fan_demo", email: "salman_demo@mail.com", bio: "Demo fan page for UI testing." },
    { name: "Katrina Fan Page (Demo)", username: "katrina_fan_demo", email: "katrina_demo@mail.com", bio: "Demo fan page for UI testing." },
    { name: "Tech Creator", username: "tech_creator", email: "tech@mail.com", bio: "Posting tech tips daily." }
  ];

  db.serialize(() => {
    db.run("DELETE FROM follows");
    db.run("DELETE FROM likes");
    db.run("DELETE FROM comments");
    db.run("DELETE FROM posts");
    db.run("DELETE FROM users");

    const userStmt = db.prepare("INSERT INTO users (name, username, email, password_hash, bio) VALUES (?, ?, ?, ?, ?)");
    demoUsers.forEach(u => userStmt.run(u.name, u.username, u.email, pass, u.bio));
    userStmt.finalize(() => {
      db.all("SELECT id, username FROM users", (e, users) => {
        const byU = Object.fromEntries(users.map(x => [x.username, x.id]));

        const posts = [
          {
            username: "salman_fan_demo",
            content: "New post (demo): Behind the scenes vibes!",
            media_type: "image",
            media_url: "https://images.unsplash.com/photo-1520975916090-3105956dac38?auto=format&fit=crop&w=1200&q=80"
          },
          {
            username: "katrina_fan_demo",
            content: "Demo post: Travel aesthetic!",
            media_type: "image",
            media_url: "https://images.unsplash.com/photo-1520975958225-9e4e2b43d89b?auto=format&fit=crop&w=1200&q=80"
          },
          {
            username: "tech_creator",
            content: "Demo video post: nature clip (mp4).",
            media_type: "video",
            media_url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
          }
        ];

        const postStmt = db.prepare("INSERT INTO posts (user_id, content, media_url, media_type) VALUES (?, ?, ?, ?)");
        posts.forEach(p => postStmt.run(byU[p.username], p.content, p.media_url, p.media_type));
        postStmt.finalize(() => {
          console.log("Seed done. Demo accounts created. Password = 123456");
          process.exit(0);
        });
      });
    });
  });
}

run();
