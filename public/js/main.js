async function toggleLike(postId, btn){
  const res = await fetch(`/like/${postId}`, { method:"POST" });
  const data = await res.json();

  const icon = btn.querySelector(".likeIcon");
  const count = btn.querySelector(".likeCount");
  const current = parseInt(count.textContent || "0", 10);

  if(data.liked){
    icon.textContent = "❤️";
    count.textContent = current + 1;
  } else {
    icon.textContent = "🤍";
    count.textContent = Math.max(0, current - 1);
  }
}

async function toggleFollow(userId, btn){
  const res = await fetch(`/follow/${userId}`, { method:"POST" });
  const data = await res.json();
  if(!data.ok) return;

  btn.textContent = data.following ? "✅ Following" : "➕ Follow";
  btn.classList.toggle("primary", !data.following);
}

const io = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{
    if(e.isIntersecting) e.target.classList.add("show");
  });
},{threshold:0.12});

window.addEventListener("load", ()=>{
  document.querySelectorAll(".reveal").forEach(el=>io.observe(el));
});
