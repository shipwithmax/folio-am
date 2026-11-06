const editions = {
  focus: {
    label: "YOUR FRONT PAGE",
    category: "TODAY’S LEAD",
    headline: "Yesterday, a decision.\nToday, a little momentum.",
    summary:
      "The proposal has a green light. Your team agreed on the next step. And you promised Sam a call. Here is what is happening in your world.",
    left: "YOUR DEVELOPING STORIES",
    priorities: [
      "The proposal is ready for its next chapter.",
      "Your team picked a direction yesterday.",
      "You kept three evenings free this week.",
    ],
    right: "THE DAY AHEAD",
    agenda: [
      ["08:30", "Time for the important work"],
      ["10:00", "A conversation, not another call"],
      ["12:30", "A proper lunch break"],
    ],
    bottom: "ONE GOOD THOUGHT",
    quote: "“What you pay attention to becomes your day.”",
  },
  curious: {
    label: "YOUR PEOPLE",
    category: "A LITTLE PERSPECTIVE",
    headline: "Good news travels\nin small messages.",
    summary:
      "Sam got the new role. Your family picked a date for dinner. Someone sent a photo you will want to keep. The small headlines are often the best ones.",
    left: "FROM YOUR INNER CIRCLE",
    priorities: [
      "Celebrate Sam’s new chapter.",
      "Keep Sunday free for family dinner.",
      "Print the photo that made you smile.",
    ],
    right: "A LITTLE FOLLOW-THROUGH",
    agenda: [
      ["A MESSAGE", "Send Sam a congratulations."],
      ["A PLAN", "Sunday dinner, finally on the calendar."],
      ["A MEMORY", "Save that photo from last weekend."],
    ],
    bottom: "A QUESTION TO KEEP",
    quote: "Who made your week a little better?",
  },
  slow: {
    label: "YOUR WEEKEND",
    category: "THE WEEKEND EDITION",
    headline: "Your weekend\nis taking shape.",
    summary:
      "The table is booked. Your walking route is saved. There is a recipe you wanted to try, and someone you have been meaning to see.",
    left: "A SHORTER KIND OF LIST",
    priorities: [
      "Make breakfast worth sitting down for.",
      "Call someone you have missed.",
      "Leave an hour completely unplanned.",
    ],
    right: "YOUR LOOSE AGENDA",
    agenda: [
      ["WHENEVER", "A second cup of coffee"],
      ["LATER", "The long way through the park"],
      ["SOMETIME", "A chapter, or maybe three"],
    ],
    bottom: "PERMISSION FOR TODAY",
    quote: "You do not have to make the most of every minute.",
  },
};
const byId = (id) => document.getElementById(id);
for (const button of document.querySelectorAll("[data-edition]"))
  button.addEventListener("click", () => {
    const ed = editions[button.dataset.edition];
    for (const peer of document.querySelectorAll("[data-edition]"))
      peer.setAttribute("aria-pressed", String(peer === button));
    for (const [id, key] of Object.entries({
      "edition-meta": "label",
      "paper-category": "category",
      "paper-headline": "headline",
      "paper-summary": "summary",
      "left-title": "left",
      "right-title": "right",
      "paper-bottom": "bottom",
      "paper-quote": "quote",
    }))
      byId(id).textContent = ed[key];
    byId("priorities").replaceChildren(
      ...ed.priorities.map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      }),
    );
    byId("agenda").replaceChildren(
      ...ed.agenda.map(([time, title]) => {
        const p = document.createElement("p");
        const b = document.createElement("b");
        b.textContent = time;
        p.append(b, document.createTextNode(title));
        return p;
      }),
    );
  });
byId("paper-name").addEventListener("input", (e) => {
  const name = e.target.value.trim().slice(0, 24) || "Your";
  byId("masthead").textContent = `The ${name} Times`;
  byId("paper-owner").textContent = name === "Your" ? "you" : name;
});

byId("paper-headline").textContent = editions.focus.headline;

for (const button of document.querySelectorAll("[data-photo]"))
  button.addEventListener("click", () => {
    for (const other of document.querySelectorAll("[data-photo]"))
      other.setAttribute("aria-pressed", String(other === button));
    byId("edition-image").classList.toggle(
      "in-color",
      button.dataset.photo === "color",
    );
  });
function updateMix() {
  const work = Number(byId("work-weight").value),
    interest = Number(byId("interest-weight").value),
    sum = work + interest;
  const share = sum ? Math.round((work / sum) * 100) : 0;
  byId("work-output").textContent = `${share}%`;
  byId("interest-output").textContent = `${sum ? 100 - share : 0}%`;
  const lead = !sum
    ? "A quiet edition. Add a little of either to shape your paper."
    : work > interest
      ? "Your lead: the people and commitments that need you."
      : interest > work
        ? "Your lead: the people and personal stories that matter."
        : "Your lead: equal room for your responsibilities and your curiosity.";
  byId("mix-result").textContent = lead;
  byId("matrix-lead").textContent = !sum
    ? "Nothing selected. Room to breathe."
    : work > interest
      ? "The time-sensitive commitment you care about."
      : interest > work
        ? "The personal update you do not want to miss."
        : "Your most relevant story, whatever its source.";
}
byId("work-weight").addEventListener("input", updateMix);
byId("interest-weight").addEventListener("input", updateMix);
const jokes = {
  dry: [
    "Me: I should spend less time on my phone.",
    "Also me: subscribes to a physical internet.",
    "DRY HUMOR · SAMPLE 001",
  ],
  absurd: [
    "Breaking: local printer develops opinions.",
    "Refuses to print Monday. Negotiations continue.",
    "ABSURD HUMOR · SAMPLE 002",
  ],
  warm: [
    "Your to-do list called.",
    "It said breakfast with someone you love counts.",
    "WHOLESOME HUMOR · SAMPLE 003",
  ],
};
for (const button of document.querySelectorAll("[data-humor]"))
  button.addEventListener("click", () => {
    for (const other of document.querySelectorAll("[data-humor]"))
      other.setAttribute("aria-pressed", String(other === button));
    const [setup, punch, label] = jokes[button.dataset.humor];
    byId("meme-setup").textContent = setup;
    byId("meme-punch").textContent = punch;
    document.querySelector(".meme-card>footer").textContent = label;
  });

document.querySelector('[data-edition="focus"]').click();
updateMix();
