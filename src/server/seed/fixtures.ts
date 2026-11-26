/**
 * Deterministic, fictional seed content. All people, organisations and posts are
 * invented for the demo. Engagement (likes/reposts) is generated as real records
 * from these seeded accounts by a deterministic rule in seeder.ts — never as
 * free-floating numbers.
 */

export interface SeedUser {
  handle: string;
  name: string;
  bio: string;
  location?: string;
  website?: string;
  protected?: boolean;
  /** Fictional "iSchoolie demo team" badge — not identity verification. */
  team?: boolean;
  suspended?: boolean;
  noAvatar?: boolean;
  dmFollowingOnly?: boolean;
  joinedDaysAgo: number;
}

export const DEFAULT_ACTOR = "maya_learns";

export const SEED_USERS: SeedUser[] = [
  { handle: "maya_learns", name: "Maya Okafor", bio: "Second-year engineering student. Robotics club, astronomy nights, too many browser tabs. 🚀", location: "Northfield", website: "https://example.org/maya", joinedDaysAgo: 610 },
  { handle: "ischoolie_team", name: "iSchoolie Team", bio: "Official demo-team account for this iSchoolie sandbox. Tips, changelogs and community guidelines.", website: "https://example.org/ischoolie", team: true, joinedDaysAgo: 900 },
  { handle: "prof_lindqvist", name: "Dr. Astrid Lindqvist", bio: "Physics teacher. Pendulums, prisms and patience. Office hours are a state of mind.", location: "Uppsala", joinedDaysAgo: 820 },
  { handle: "coach_reyes", name: "Coach Daniel Reyes", bio: "Track & field and soccer coach. Hydrate. Stretch. Repeat.", location: "Northfield", joinedDaysAgo: 700 },
  { handle: "robotics_club", name: "Northfield Robotics", bio: "Student robotics club. Building, breaking, rebuilding. Meetings Thu 4pm, Lab B.", location: "Lab B", website: "https://example.org/robotics", joinedDaysAgo: 540 },
  { handle: "artby_kenji", name: "Kenji Watanabe", bio: "Illustrator & ceramics. 絵と陶芸。Slow art for fast times.", location: "Osaka", joinedDaysAgo: 480 },
  { handle: "lucia_writes", name: "Lucía Fernández", bio: "Escritora. Short stories, long walks. Creative writing circle host.", location: "Valencia", joinedDaysAgo: 450 },
  { handle: "amir_codes", name: "Amir Haddad", bio: "Learning to code in public. TypeScript, Rust and Arabic calligraphy. مرحبا!", location: "Amman", joinedDaysAgo: 400 },
  { handle: "priya_reads", name: "Priya Nair", bio: "Book club organiser. Currently reading three books and finishing none.", location: "Kochi", joinedDaysAgo: 390 },
  { handle: "theo_math", name: "Théo Martin", bio: "Professeur de maths. Puzzles, proofs and the occasional bad pun.", location: "Lyon", joinedDaysAgo: 600 },
  { handle: "green_campus", name: "Green Campus Collective", bio: "Student sustainability group. Compost, cycling, community gardens.", website: "https://example.org/green", joinedDaysAgo: 520 },
  { handle: "stargazer_sam", name: "Sam Okoye", bio: "Astronomy club captain. Clear skies or bust. 🔭", location: "Northfield", joinedDaysAgo: 350 },
  { handle: "jordan_private", name: "Jordan Blake", bio: "Small circle, protected posts. Study notes and sketches.", protected: true, joinedDaysAgo: 300 },
  { handle: "riley_locked", name: "Riley Chen", bio: "Protected account. Marine biology nerd.", protected: true, location: "Harbor City", joinedDaysAgo: 260 },
  { handle: "noor_debates", name: "Noor Siddiqui", bio: "Debate team captain. Steelman everything.", joinedDaysAgo: 330 },
  { handle: "ben_music", name: "Ben Adeyemi", bio: "Jazz band, bass guitar, music theory study group.", joinedDaysAgo: 310 },
  { handle: "chem_with_ana", name: "Ana Kowalski", bio: "Chemistry teacher. Safety goggles are a fashion statement.", location: "Kraków", joinedDaysAgo: 560 },
  { handle: "history_hub", name: "History Hub", bio: "Daily (fictional demo) history notes from our student historians.", joinedDaysAgo: 640 },
  { handle: "eli_photos", name: "Eli Novak", bio: "Photography club. 35mm, golden hour, bad puns about exposure.", joinedDaysAgo: 280 },
  { handle: "zara_designs", name: "Zara Mensah", bio: "Product design student. Grids, type and accessible colour.", location: "Accra", joinedDaysAgo: 240 },
  { handle: "spam_bot_99", name: "Free Prizes 4 U", bio: "Click here for prizes!!!", joinedDaysAgo: 20 },
  { handle: "loud_larry", name: "Larry Loudon", bio: "Opinions about everything. ALL CAPS ENTHUSIAST.", joinedDaysAgo: 200 },
  { handle: "sofia_chess", name: "Sofia Rossi", bio: "Chess club. 1.e4 best by test. Puzzles every Monday.", location: "Turin", joinedDaysAgo: 230 },
  { handle: "omar_runs", name: "Omar Farouk", bio: "Cross-country, early mornings, slow coffee.", joinedDaysAgo: 150, dmFollowingOnly: false },
  { handle: "newbie_nia", name: "Nia Brooks", bio: "", noAvatar: true, joinedDaysAgo: 3 },
  { handle: "suspended_acct", name: "Suspended Fixture", bio: "This fictional account is suspended to demonstrate the suspended state.", suspended: true, joinedDaysAgo: 100 },
  { handle: "campus_news", name: "Campus Newsroom", bio: "Student-run newsroom (fictional). Tips welcome.", website: "https://example.org/news", joinedDaysAgo: 720 },
];

/** follower -> followees */
export const FOLLOWS: Record<string, string[]> = {
  maya_learns: ["ischoolie_team", "prof_lindqvist", "robotics_club", "amir_codes", "stargazer_sam", "zara_designs", "chem_with_ana", "theo_math", "lucia_writes", "jordan_private", "eli_photos", "campus_news", "loud_larry", "green_campus"],
  ischoolie_team: ["maya_learns", "campus_news"],
  prof_lindqvist: ["maya_learns", "chem_with_ana", "theo_math", "stargazer_sam", "robotics_club", "history_hub"],
  coach_reyes: ["omar_runs", "campus_news", "noor_debates", "maya_learns"],
  robotics_club: ["maya_learns", "amir_codes", "zara_designs", "prof_lindqvist", "ischoolie_team"],
  artby_kenji: ["eli_photos", "zara_designs", "lucia_writes"],
  lucia_writes: ["priya_reads", "artby_kenji", "maya_learns", "history_hub"],
  amir_codes: ["maya_learns", "robotics_club", "zara_designs", "ischoolie_team", "sofia_chess"],
  priya_reads: ["lucia_writes", "history_hub", "noor_debates", "maya_learns"],
  theo_math: ["prof_lindqvist", "sofia_chess", "maya_learns"],
  green_campus: ["campus_news", "maya_learns", "coach_reyes"],
  stargazer_sam: ["maya_learns", "prof_lindqvist", "eli_photos", "robotics_club"],
  jordan_private: ["maya_learns", "artby_kenji", "priya_reads"],
  riley_locked: ["green_campus", "eli_photos"],
  noor_debates: ["history_hub", "priya_reads", "campus_news", "maya_learns"],
  ben_music: ["eli_photos", "lucia_writes", "campus_news"],
  chem_with_ana: ["prof_lindqvist", "maya_learns", "green_campus"],
  history_hub: ["campus_news", "noor_debates"],
  eli_photos: ["artby_kenji", "stargazer_sam", "zara_designs", "maya_learns"],
  zara_designs: ["maya_learns", "artby_kenji", "amir_codes", "ischoolie_team"],
  spam_bot_99: ["maya_learns"],
  loud_larry: ["maya_learns", "campus_news"],
  sofia_chess: ["theo_math", "amir_codes"],
  omar_runs: ["coach_reyes", "green_campus"],
  newbie_nia: ["ischoolie_team"],
  campus_news: ["ischoolie_team", "green_campus", "robotics_club"],
};

/** Accounts whose new posts Maya has the profile bell on for. */
export const NOTIFY_ON: [string, string][] = [["maya_learns", "robotics_club"]];

export const PENDING_REQUESTS: [string, string][] = [
  ["ben_music", "jordan_private"],
  ["omar_runs", "jordan_private"],
];
export const BLOCKS: [string, string][] = [["maya_learns", "spam_bot_99"]];
export const MUTES: [string, string][] = [["maya_learns", "loud_larry"]];
export const MUTED_WORDS: [string, string][] = [["maya_learns", "spoiler"]];

export type SeedMediaRef =
  | { photo: string; alt: string }
  | { gif: string; alt: string }
  | { video: string; alt: string };

export interface SeedPost {
  k: string;
  by: string;
  text: string;
  /** minutes before workspace creation */
  ago: number;
  reply?: string;
  quote?: string;
  media?: SeedMediaRef[];
  poll?: { choices: string[]; endsInMinutes: number };
  audience?: "EVERYONE" | "FOLLOWING" | "MENTIONED";
  deleted?: boolean;
  /** Author marked the media as potentially sensitive. */
  sensitive?: boolean;
  lang?: string;
  /** deterministic engagement weight 0..1 */
  heat?: number;
}

export const PHOTO_DIMS: Record<string, [number, number]> = {
  "mountains.jpg": [1200, 800],
  "library.jpg": [1200, 800],
  "chalkboard.jpg": [1200, 800],
  "garden.jpg": [1200, 900],
  "robot.jpg": [1000, 1000],
  "chart.jpg": [1200, 675],
  "night-sky.jpg": [1200, 800],
  "pottery.jpg": [900, 1100],
  "soccer.jpg": [1200, 800],
  "lab.jpg": [1200, 800],
};
export const GIF_DIMS: [number, number] = [320, 240];
export const VIDEO_DIMS: [number, number] = [640, 360];

const H = 60;
const D = 24 * H;

export const SEED_POSTS: SeedPost[] = [
  // --- iSchoolie team ----------------------------------------------------------
  { k: "welcome", by: "ischoolie_team", ago: 20 * D, heat: 0.9, text: "Welcome to iSchoolie! 👋\n\nThis is a sandbox with fictional people and posts. Everything you do here — posts, likes, messages — is saved to your own private demo workspace.\n\nStart with Explore, or say hi with #FirstPost." },
  { k: "tips1", by: "ischoolie_team", ago: 19 * D, reply: "welcome", text: "Tip: switch between Home (ranked) and Latest (newest first) with the ✦ button at the top of your timeline." },
  { k: "tips2", by: "ischoolie_team", ago: 19 * D - 5, reply: "tips1", text: "Tip: press ? anywhere to see keyboard shortcuts. n opens a new post, j/k move between posts, l likes." },
  { k: "guidelines", by: "ischoolie_team", ago: 6 * D, heat: 0.5, text: "Community guidelines, short version:\n1. Be kind.\n2. Credit people's work.\n3. Report what's harmful — reports are reviewed by people, and submitting one doesn't mean a decision has been made." },

  // --- Maya ---------------------------------------------------------------------
  { k: "maya_pin", by: "maya_learns", ago: 9 * D, heat: 0.8, media: [{ photo: "robot.jpg", alt: "A friendly blue robot illustration with round eyes, an antenna and stubby arms." }], text: "Our robotics club finally named the robot: Bolt. It drives in a straight line about 60% of the time, which we're calling a feature. 🤖 #robotics" },
  { k: "maya_1", by: "maya_learns", ago: 3 * H, heat: 0.6, text: "Studying for the physics midterm with a pendulum made of a shoelace and a stapler. Results: inconclusive. Vibes: excellent." },
  { k: "maya_2", by: "maya_learns", ago: 26 * H, heat: 0.5, poll: { choices: ["Pomodoro (25/5)", "Long blocks (90/20)", "Whenever panic strikes", "What's a schedule?"], endsInMinutes: 2 * D }, text: "How do you structure study sessions?" },
  { k: "maya_3", by: "maya_learns", ago: 2 * D, heat: 0.3, text: "Hot take: the best way to learn a new tool is to break it on purpose in a safe place. That's literally what this sandbox is for. #FirstPost" },
  { k: "maya_4", by: "maya_learns", ago: 4 * D, heat: 0.7, media: [{ photo: "night-sky.jpg", alt: "A dark starry sky over low hills with a thin crescent moon in the upper right." }, { photo: "mountains.jpg", alt: "Snow-capped grey mountains under a pale blue sky with a yellow sun and green hills." }], text: "Astronomy club trip recap: two hours of clouds, then twenty perfect minutes. Worth it. #astronomy" },
  { k: "maya_5", by: "maya_learns", ago: 7 * D, text: "Note to self: commit messages like \"fix\" and \"fix again\" are not documentation." },
  { k: "maya_thread1", by: "maya_learns", ago: 5 * D, heat: 0.6, text: "Things I wish I knew in first year, a thread 🧵\n\n1/ Office hours are not just for people who are struggling. Go early, go often." },
  { k: "maya_thread2", by: "maya_learns", ago: 5 * D - 1, reply: "maya_thread1", text: "2/ Start the lab report the day of the lab. Future you is not more motivated than present you." },
  { k: "maya_thread3", by: "maya_learns", ago: 5 * D - 2, reply: "maya_thread2", text: "3/ Find one study buddy who explains things differently from you. Arguing over a whiteboard is the fastest way to learn." },
  { k: "maya_thread4", by: "maya_learns", ago: 5 * D - 3, reply: "maya_thread3", text: "4/ Sleep is a study technique. That's the thread." },
  { k: "maya_quote_prof", by: "maya_learns", ago: 30 * H, quote: "prof_pend", text: "This demo genuinely made the period formula click for me. Ten out of ten pendulums." },

  // --- Prof Lindqvist -------------------------------------------------------------
  { k: "prof_pend", by: "prof_lindqvist", ago: 32 * H, heat: 0.8, media: [{ video: "orbit.webm", alt: "Animation of a small blue planet orbiting a yellow star on an elliptical path, with a red moon orbiting faster." }], text: "Friday demo: orbits are just falling sideways forever. Watch the inner moon lap the planet. #physics #astronomy" },
  { k: "prof_2", by: "prof_lindqvist", ago: 3 * D, heat: 0.5, text: "Reminder for everyone in Physics II: the pendulum lab write-ups are due next week. Measure from the pivot to the centre of mass, not the bottom of the bob!" },
  { k: "prof_3", by: "prof_lindqvist", ago: 8 * D, heat: 0.4, media: [{ photo: "chalkboard.jpg", alt: "A green chalkboard with E equals m c squared, the Pythagorean theorem, an integral and a triangle drawn in chalk." }], text: "The board after today's review session. Yes, I know the integral is a little out of place. Some students asked." },
  { k: "prof_reply_maya", by: "prof_lindqvist", ago: 2 * H, reply: "maya_1", text: "@maya_learns The stapler-pendulum is a time-honoured tradition. Try timing ten swings and dividing by ten — your error bars will thank you." },
  { k: "prof_audience", by: "prof_lindqvist", ago: 20 * H, audience: "FOLLOWING", text: "Opening a thread for my current students' questions about the midterm. Replies limited to people I follow so it stays on topic." },

  // --- Robotics club --------------------------------------------------------------
  { k: "rob_1", by: "robotics_club", ago: 6 * H, heat: 0.7, media: [{ photo: "chart.jpg", alt: "Bar chart titled Robotics club practice hours showing eight weeks rising from 42 to 92 hours." }], text: "Practice hours are up every week since we started the buddy system. Competition is in 3 weeks. Who's bringing snacks? #robotics" },
  { k: "rob_2", by: "robotics_club", ago: 2 * D + 3 * H, heat: 0.5, text: "Meeting moved to Lab C this Thursday — Lab B is getting new benches. Same time, 4pm." },
  { k: "rob_3", by: "robotics_club", ago: 10 * D, text: "Our build log is now public. If you've ever wondered what 40 hours of cable management looks like, wonder no more. #robotics" },
  { k: "rob_reply", by: "robotics_club", ago: 9 * D - 30, reply: "maya_pin", text: "@maya_learns The other 40% of the time it's exploring. Very curious robot." },

  // --- Amir -----------------------------------------------------------------------
  { k: "amir_1", by: "amir_codes", ago: 5 * H, heat: 0.6, text: "Day 47 of learning Rust: the borrow checker and I have reached an understanding. It understands me. I do not understand it. #coding" },
  { k: "amir_ar", by: "amir_codes", ago: 22 * H, lang: "ar", heat: 0.4, text: "تعلم البرمجة مثل تعلم لغة جديدة: كل يوم كلمة جديدة، وكل خطأ درس. #coding" },
  { k: "amir_2", by: "amir_codes", ago: 3 * D, heat: 0.3, text: "TypeScript tip: `satisfies` lets you check a value against a type without widening it. It's my favourite keyword of the year." },
  { k: "amir_quote", by: "amir_codes", ago: 4 * H, quote: "rob_1", text: "Can confirm: the buddy system works. My buddy is the one who reminds me to eat." },
  { k: "amir_reply_maya", by: "amir_codes", ago: 2 * D - 40, reply: "maya_3", text: "@maya_learns Breaking things on purpose is how I learned git. And how I learned what `reset --hard` does. 🙃" },

  // --- Stargazer Sam --------------------------------------------------------------
  { k: "sam_1", by: "stargazer_sam", ago: 12 * H, heat: 0.7, text: "Clear skies forecast for Saturday night! Astronomy club meets at the east field at 9pm. Bring a red flashlight and a warm layer. #astronomy" },
  { k: "sam_2", by: "stargazer_sam", ago: 4 * D - 90, reply: "maya_4", text: "@maya_learns Those twenty minutes were the best of the semester. That moon!" },
  { k: "sam_poll", by: "stargazer_sam", ago: 8 * D, poll: { choices: ["Jupiter", "Saturn", "The Moon", "Orion Nebula"], endsInMinutes: 1 * D }, text: "Which target should we start with on observing night?" },

  // --- Zara -----------------------------------------------------------------------
  { k: "zara_1", by: "zara_designs", ago: 8 * H, heat: 0.5, text: "Accessibility reminder: colour alone shouldn't carry meaning. If your error state is just \"red\", someone will miss it. Add an icon and text. #design" },
  { k: "zara_2", by: "zara_designs", ago: 3 * D - 200, heat: 0.4, text: "A grid isn't a cage, it's a promise you make to the reader about where things will be." },
  { k: "zara_reply_amir", by: "zara_designs", ago: 4 * H - 20, reply: "amir_1", text: "@amir_codes This is the most relatable thing I've read all week." },

  // --- Chemistry ------------------------------------------------------------------
  { k: "ana_1", by: "chem_with_ana", ago: 10 * H, heat: 0.6, media: [{ photo: "lab.jpg", alt: "Illustrated chemistry lab bench with an Erlenmeyer flask of cyan liquid and two test tubes with purple and orange liquid." }], text: "Titration practical today. Remember: the endpoint is a faint pink, not a dramatic magenta. Slow down near the end! #chemistry" },
  { k: "ana_2", by: "chem_with_ana", ago: 5 * D, text: "Goggles on before you open the cabinet, not after. Every single time." },
  { k: "ana_sensitive", by: "chem_with_ana", ago: 3 * D + 30, sensitive: true, media: [{ photo: "lab.jpg", alt: "Illustrated lab bench; the author marked this media as sensitive to demonstrate the warning screen." }], text: "Dissection lab prep photos for tomorrow (media marked sensitive, so it shows a warning first)." },

  // --- Théo -----------------------------------------------------------------------
  { k: "theo_fr", by: "theo_math", ago: 15 * H, lang: "fr", heat: 0.5, text: "Énigme du lundi : un escargot grimpe un mur de 10 m. Il monte de 3 m le jour et glisse de 2 m la nuit. Combien de jours pour sortir ? Réponses en commentaire ! #maths" },
  { k: "theo_deleted", by: "theo_math", ago: 6 * D, deleted: true, text: "This post was deleted by its author." },
  { k: "reply_to_deleted", by: "maya_learns", ago: 6 * D - 30, reply: "theo_deleted", text: "@theo_math Wait, I think the answer depends on whether the snail starts at dawn?" },
  { k: "quote_of_deleted", by: "sofia_chess", ago: 6 * D - 60, quote: "theo_deleted", text: "Saving this one for the next puzzle night." },
  { k: "theo_reply_answer", by: "maya_learns", ago: 14 * H, reply: "theo_fr", text: "@theo_math 8 days! On day 8 it climbs the last 3 m before it can slide back. 🐌" },
  { k: "theo_2", by: "theo_math", ago: 13 * H, reply: "theo_reply_answer", text: "@maya_learns Exactement ! Bravo." },

  // --- Lucía ----------------------------------------------------------------------
  { k: "lucia_es", by: "lucia_writes", ago: 18 * H, lang: "es", heat: 0.5, text: "Consejo para escribir: termina cada sesión a mitad de una frase. Al día siguiente sabrás exactamente por dónde empezar. ✍️ #writing" },
  { k: "lucia_2", by: "lucia_writes", ago: 4 * D, heat: 0.4, text: "Creative writing circle this week: write a story in exactly 50 words. No more, no less. Bring it on paper." },
  { k: "lucia_long", by: "lucia_writes", ago: 9 * D, text: "Today's prompt: a library where every book is a letter someone never sent. You're the librarian. A visitor asks for the one addressed to them. What does it say?" },

  // --- Priya ----------------------------------------------------------------------
  { k: "priya_1", by: "priya_reads", ago: 20 * H, heat: 0.4, media: [{ photo: "library.jpg", alt: "Four wooden shelves packed with colourful book spines on a cream background." }], text: "Book club pick for next month is decided by this shelf and a pair of dice. Results tomorrow. 📚" },
  { k: "priya_hi", by: "priya_reads", ago: 7 * D, lang: "hi", text: "पढ़ना एक यात्रा है जो कुर्सी से उठे बिना होती है। 📖 #bookclub" },
  { k: "priya_poll_old", by: "priya_reads", ago: 12 * D, poll: { choices: ["Mystery", "Sci-fi", "Poetry"], endsInMinutes: 1 * D }, text: "Genre for the winter reading list? (poll closed)" },

  // --- Kenji ----------------------------------------------------------------------
  { k: "kenji_ja", by: "artby_kenji", ago: 1 * D + 2 * H, lang: "ja", heat: 0.6, media: [{ photo: "pottery.jpg", alt: "A rust-orange ceramic vase with a pale yellow glaze stripe, standing on a beige table." }], text: "新しい花瓶が焼き上がりました。釉薬の線が少し揺れているのが好きです。🏺 #ceramics" },
  { k: "kenji_2", by: "artby_kenji", ago: 6 * D, text: "Drawing every day for a year taught me one thing: the bad drawings are the price of the good ones. Pay it gladly." },

  // --- Eli ------------------------------------------------------------------------
  { k: "eli_1", by: "eli_photos", ago: 16 * H, heat: 0.5, media: [{ photo: "garden.jpg", alt: "A meadow full of pink, purple and yellow flowers under a pale blue sky." }, { photo: "mountains.jpg", alt: "Snowy mountain range beneath a pale yellow sun." }, { photo: "night-sky.jpg", alt: "Night sky full of stars above dark hills." }], text: "Three photos, three days, one roll of film. Photography club walk recap. #photography" },
  { k: "eli_2", by: "eli_photos", ago: 7 * D, text: "Exposure joke: I'd tell you one, but it might be underdeveloped." },

  // --- Green campus ---------------------------------------------------------------
  { k: "green_1", by: "green_campus", ago: 2 * D, heat: 0.5, media: [{ gif: "spinner.gif", alt: "Animated green plus sign spinning on a mint background." }], text: "Compost bins are back at the cafeteria! Green bin = food scraps, blue = recycling. We'll be there at lunch to answer questions. ♻️ #sustainability" },
  { k: "green_2", by: "green_campus", ago: 11 * D, text: "Bike repair pop-up next Wednesday. Bring your squeaky chains." },

  // --- Campus news ----------------------------------------------------------------
  { k: "news_1", by: "campus_news", ago: 7 * H, heat: 0.7, text: "Library hours extended to midnight during exam weeks, the student council announced today. Quiet floors 3 and 4 stay silent zones." },
  { k: "news_2", by: "campus_news", ago: 1 * D + 6 * H, heat: 0.5, media: [{ photo: "soccer.jpg", alt: "Top-down illustration of a green soccer pitch with white lines and a ball near the centre circle." }], text: "The new soccer pitch opens Monday after a summer of resurfacing. First match: faculty vs. students. #sports" },
  { k: "news_3", by: "campus_news", ago: 5 * D, text: "Science fair registration closes Friday. 42 projects so far, including at least three volcanoes." },

  // --- Coach Reyes ----------------------------------------------------------------
  { k: "coach_1", by: "coach_reyes", ago: 9 * H, heat: 0.4, text: "Track practice is ON despite the drizzle. Bring layers. We run in all weather except lightning. #sports" },
  { k: "coach_quote", by: "coach_reyes", ago: 1 * D, quote: "news_2", text: "Faculty team has been practicing. Students, consider yourselves warned. ⚽" },

  // --- Omar -----------------------------------------------------------------------
  { k: "omar_1", by: "omar_runs", ago: 1 * D + 9 * H, text: "5:30am run, 8km, one very confused duck. Good morning. #running" },

  // --- Noor -----------------------------------------------------------------------
  { k: "noor_1", by: "noor_debates", ago: 1 * D + 1 * H, heat: 0.4, text: "Debate practice motion this week: \"This house would replace homework with project-based learning.\" Sign up for sides by Wednesday." },
  { k: "noor_2", by: "noor_debates", ago: 8 * D, text: "Steelmanning is a skill. If you can't argue the other side well, you don't understand your own yet." },

  // --- Ben ------------------------------------------------------------------------
  { k: "ben_1", by: "ben_music", ago: 2 * D + 5 * H, media: [{ gif: "clap.gif", alt: "Animated yellow star pulsing with the words Great job!" }], text: "Jazz band nailed the bridge tonight. Twelve weeks of rehearsal for eight bars. Worth every minute. 🎷 #music" },

  // --- Sofia ----------------------------------------------------------------------
  { k: "sofia_1", by: "sofia_chess", ago: 3 * D + 2 * H, text: "Monday puzzle: White to move and mate in two. Board posted in the club room. First correct answer gets a coffee. ♟️ #chess" },
  { k: "sofia_it", by: "sofia_chess", ago: 9 * D, lang: "it", text: "Gli scacchi insegnano la pazienza: ogni mossa ha una conseguenza. #chess" },

  // --- History hub ----------------------------------------------------------------
  { k: "hist_1", by: "history_hub", ago: 2 * D + 1 * H, heat: 0.3, text: "Student historians' note: the first public lending libraries were funded by subscriptions. Members paid a yearly fee to borrow books — the original \"book club\". #history" },
  { k: "hist_2", by: "history_hub", ago: 10 * D, text: "Archive tip: always note where you found a source, even when you think you'll remember. You won't." },

  // --- Jordan (protected) ---------------------------------------------------------
  { k: "jordan_1", by: "jordan_private", ago: 11 * H, text: "Sketchbook page 14: hands are still hard. Feet are harder. Doing ten of each tomorrow." },
  { k: "jordan_2", by: "jordan_private", ago: 3 * D, media: [{ photo: "pottery.jpg", alt: "Reference photo of an orange ceramic vase." }], text: "Study notes for the art history exam are finally organised. Colour-coded and everything." },

  // --- Riley (protected, Maya not following) --------------------------------------
  { k: "riley_1", by: "riley_locked", ago: 1 * D, text: "Tide pools at low tide this morning: three anemones, one very offended crab." },
  { k: "riley_2", by: "riley_locked", ago: 6 * D, text: "Marine bio field trip notes typed up. Sharing with my study group only." },

  // --- Larry (muted by Maya) ------------------------------------------------------
  { k: "larry_1", by: "loud_larry", ago: 2 * H, text: "HOT TAKE: PINEAPPLE ON PIZZA IS FINE AND I WILL DIE ON THIS HILL" },
  { k: "larry_reply", by: "loud_larry", ago: 2 * D - 10, reply: "maya_3", text: "@maya_learns BREAKING THINGS IS NOT A STRATEGY!!!" },

  // --- Spam (blocked by Maya) -----------------------------------------------------
  { k: "spam_1", by: "spam_bot_99", ago: 1 * H, text: "@maya_learns CONGRATS you won a FREE PRIZE click the link in bio!!!" },

  // --- Suspended fixture ----------------------------------------------------------
  { k: "susp_1", by: "suspended_acct", ago: 15 * D, text: "This post belongs to a suspended fixture account." },

  // --- More conversation & variety ------------------------------------------------
  { k: "conv_1", by: "zara_designs", ago: 2 * H + 30, reply: "maya_1", text: "@maya_learns A stapler is a perfectly respectable bob. Very dense. Good moment of inertia." },
  { k: "conv_2", by: "maya_learns", ago: 2 * H + 10, reply: "conv_1", text: "@zara_designs It's the shoelace I'm worried about honestly" },
  { k: "conv_3", by: "chem_with_ana", ago: 1 * H + 40, reply: "maya_1", text: "@maya_learns As long as nobody is titrating anything near the stapler, I approve." },
  { k: "conv_4", by: "stargazer_sam", ago: 11 * H, reply: "sam_1", text: "Update: we'll have two telescopes and the club binoculars. Bring your own if you have them!" },
  { k: "conv_5", by: "maya_learns", ago: 10 * H + 30, reply: "sam_1", text: "@stargazer_sam I'll bring hot chocolate for everyone ☕" },
  { k: "conv_6", by: "amir_codes", ago: 5 * D + 60, reply: "maya_thread4", text: "@maya_learns Number 4 should be number 1." },
  { k: "conv_7", by: "prof_lindqvist", ago: 5 * D + 30, reply: "maya_thread1", text: "@maya_learns Speaking for teachers everywhere: please do come to office hours. It gets lonely." },
  { k: "conv_8", by: "theo_math", ago: 14 * H + 30, reply: "theo_fr", text: "Indice : ne raisonnez pas seulement en mètres par jour. 😉" },
  { k: "conv_9", by: "lucia_writes", ago: 17 * H, reply: "lucia_es", text: "In English: end each writing session mid-sentence. Tomorrow you'll know exactly where to start." },
  { k: "conv_10", by: "eli_photos", ago: 15 * H, reply: "eli_1", text: "Roll 2 is developing now. Fingers crossed for the night shots." },
  { k: "conv_11", by: "robotics_club", ago: 5 * H + 30, reply: "rob_1", text: "Snack sign-up sheet is on the lab door." },
  { k: "conv_12", by: "maya_learns", ago: 5 * H + 10, reply: "rob_1", text: "@robotics_club Claiming pretzels. And Bolt is bringing nothing because Bolt is a robot." },
  { k: "conv_13", by: "green_campus", ago: 1 * D + 20 * H, reply: "green_1", text: "Thank you to everyone who stopped by — 30 kg of food scraps diverted on day one! 🌱" },
  { k: "conv_14", by: "noor_debates", ago: 1 * D, reply: "noor_1", text: "Reminder: sides will be assigned randomly if you don't sign up. Choose your fate." },
  { k: "conv_15", by: "priya_reads", ago: 19 * H, reply: "priya_1", text: "The dice have spoken: we're reading a mystery. 🔍" },
  { k: "conv_16", by: "campus_news", ago: 6 * H + 30, reply: "news_1", text: "Correction: floors 3 AND 4 are silent zones, not just floor 4. We've updated the article." },
  { k: "conv_17", by: "sofia_chess", ago: 3 * D, reply: "sofia_1", text: "We have a winner! Congrats to the first-year who found Qh7+." },
  { k: "conv_18", by: "zara_designs", ago: 7 * H + 40, reply: "zara_1", text: "Bonus: test your palette with a greyscale screenshot. If the states blend together, so will they for some readers." },

  // --- Quotes & more text variety -------------------------------------------------
  { k: "q_1", by: "stargazer_sam", ago: 31 * H, quote: "prof_pend", text: "Showing this at observing night as a warm-up. #astronomy" },
  { k: "q_2", by: "priya_reads", ago: 2 * D, quote: "hist_1", text: "We are carrying on a proud tradition, apparently." },
  { k: "q_3", by: "maya_learns", ago: 7 * H + 15, quote: "news_1", text: "Midnight library hours during exams 🙏 the student council has done it." },
  { k: "q_4", by: "zara_designs", ago: 3 * D + 1 * H, quote: "amir_2", text: "Adding to my list of TypeScript features I'll pretend I always knew." },
  { k: "long_1", by: "noor_debates", ago: 6 * D, text: "A short list of debate rules that also work in life:\n• Define your terms.\n• Separate the claim from the person.\n• Concede good points quickly.\n• Summarise the other side before you answer it.\n• End on time." },
  { k: "long_url", by: "campus_news", ago: 3 * D + 6 * H, text: "Our full science fair guide, including judging criteria and a safety checklist, is up at https://example.org/news/science-fair-guide — please read it before registering!" },
  { k: "unbroken", by: "amir_codes", ago: 6 * D + 3 * H, text: "When the compiler error is just one long word: thisIdentifierIsDefinitelyTooLongToBeReasonableButHereWeAreAnywayLearningTheHardWay" },
  { k: "emoji_1", by: "ben_music", ago: 4 * D + 2 * H, text: "Practice log: 🎸🎸🎸🎷🥁🎹 — six instruments, one band room, zero neighbours who are happy about it. #music" },
  { k: "spoiler_post", by: "lucia_writes", ago: 1 * D + 3 * H, text: "Book club spoiler: the librarian was the narrator all along! (Muted words hide posts like this from Home.)" },
  { k: "team_gif", by: "ischoolie_team", ago: 3 * D + 4 * H, media: [{ gif: "bounce.gif", alt: "Animated blue ball bouncing with a soft shadow on a pale background." }], text: "Animated GIFs work in posts and messages. Pick one from the GIF button in the composer — it's a small bundled collection in this demo." },
  { k: "team_video", by: "ischoolie_team", ago: 3 * D + 5 * H, quote: "prof_pend", text: "Video posts support real playback controls. Turn autoplay off in Settings → Data usage if you prefer." },
  { k: "maya_reply_ana", by: "maya_learns", ago: 9 * H, reply: "ana_1", text: "@chem_with_ana Faint pink. Faint. Pink. Writing it on my hand." },
  { k: "kenji_reply", by: "eli_photos", ago: 1 * D, reply: "kenji_ja", text: "@artby_kenji That wobble in the glaze line is my favourite part." },
  { k: "zara_mention_maya", by: "zara_designs", ago: 1 * H + 10, text: "Pairing with @maya_learns on the robotics club website tomorrow. Accessible contrast or bust. #design" },
  { k: "amir_mention_maya", by: "amir_codes", ago: 50, text: "@maya_learns want to review my Rust PR later? It compiles! (On my machine.)" },
  { k: "sam_3", by: "stargazer_sam", ago: 2 * D + 8 * H, media: [{ photo: "night-sky.jpg", alt: "Starry sky over dark hills with a crescent moon." }], text: "Practice sky chart for Saturday. Find the crescent first, then work your way west. #astronomy" },
  { k: "coach_2", by: "coach_reyes", ago: 6 * D + 2 * H, text: "Stretch before, stretch after, and stretch the truth about how fast you ran. Coach's orders." },
  { k: "hist_3", by: "history_hub", ago: 4 * D + 5 * H, text: "Student historians are cataloguing the school's old yearbooks. If you find yourself in one, no you didn't." },
  { k: "green_3", by: "green_campus", ago: 4 * D + 1 * H, text: "Community garden update: tomatoes are thriving, the basil is sulking. #sustainability" },
  { k: "ana_3", by: "chem_with_ana", ago: 2 * D + 10 * H, text: "Today's chemistry joke: I'd tell you a joke about sodium, but Na." },
  { k: "theo_3", by: "theo_math", ago: 3 * D + 9 * H, text: "Proof by intimidation is not a valid proof technique. Please stop writing \"obviously\" on your homework. #maths" },
  { k: "robot_video_q", by: "robotics_club", ago: 30 * H + 20, reply: "prof_pend", text: "@prof_lindqvist Can we borrow this for our navigation lesson? Bolt also orbits things. Accidentally." },
  { k: "prof_reply_rob", by: "prof_lindqvist", ago: 30 * H, reply: "robot_video_q", text: "@robotics_club Of course. Credit the physics department and Bolt." },
  { k: "maya_hidden_target", by: "maya_learns", ago: 2 * D + 2 * H, text: "Looking for study group members for Calc II — evenings, library floor 3. Reply if you're in!" },
  { k: "hidden_reply", by: "loud_larry", ago: 2 * D + 1 * H, reply: "maya_hidden_target", text: "@maya_learns CALC IS USELESS LEARN TO TRADE CARDS INSTEAD" },
  { k: "visible_reply", by: "amir_codes", ago: 2 * D + 1 * H - 20, reply: "maya_hidden_target", text: "@maya_learns I'm in. Bringing flashcards." },
  { k: "mention_only", by: "noor_debates", ago: 18 * H, audience: "MENTIONED", text: "@maya_learns @priya_reads can you two judge the practice round on Thursday? Replies limited to people I mentioned." },
  { k: "nia_first", by: "ischoolie_team", ago: 2 * D + 40, text: "Say hello to new members this week — newcomers often start with an empty profile. Following a few topics in Explore helps fill Home." },
  { k: "riley_public_reply", by: "eli_photos", ago: 22 * H, text: "Golden hour on the harbour tonight was unreal. Couldn't stop shooting. #photography" },
  { k: "maya_6", by: "maya_learns", ago: 12 * D, text: "Joined iSchoolie to keep up with the robotics club. Staying for the astronomy memes. #FirstPost" },
  { k: "ischool_scheduled_note", by: "ischoolie_team", ago: 8 * D + 3 * H, text: "You can schedule posts from the composer's calendar button. Scheduled posts publish from our server-side worker — even if you close the tab." },
];

export interface SeedConversation {
  key: string;
  kind: "DIRECT" | "GROUP";
  name?: string;
  members: string[];
  creator: string;
  /** Members (other than creator) who haven't accepted (message request). */
  requests?: string[];
  messages: { from: string; text: string; ago: number; media?: SeedMediaRef; sharePost?: string; react?: [string, string][] }[];
  /** member -> minutes ago they last read */
  readAgo?: Record<string, number>;
}

export const SEED_CONVERSATIONS: SeedConversation[] = [
  {
    key: "maya_prof",
    kind: "DIRECT",
    members: ["maya_learns", "prof_lindqvist"],
    creator: "maya_learns",
    messages: [
      { from: "maya_learns", text: "Hi Dr. Lindqvist! Quick question about the pendulum lab — should we include air resistance in the error analysis?", ago: 2 * D },
      { from: "prof_lindqvist", text: "Good question. Mention it qualitatively; you don't need to model it.", ago: 2 * D - 30, react: [["maya_learns", "👍"]] },
      { from: "maya_learns", text: "Perfect, thank you!", ago: 2 * D - 25 },
      { from: "prof_lindqvist", text: "Also — nice work on the stapler pendulum. 😄", ago: 90 },
      { from: "prof_lindqvist", text: "Office hours are moved to Wednesday this week.", ago: 80 },
    ],
    readAgo: { maya_learns: 100, prof_lindqvist: 85 },
  },
  {
    key: "maya_amir",
    kind: "DIRECT",
    members: ["maya_learns", "amir_codes"],
    creator: "amir_codes",
    messages: [
      { from: "amir_codes", text: "Did you see the robotics club practice chart?", ago: 5 * H },
      { from: "amir_codes", text: "", ago: 5 * H - 1, sharePost: "rob_1" },
      { from: "maya_learns", text: "Yes!! The buddy system is working. You're my buddy btw, remind me to eat.", ago: 4 * H + 30, react: [["amir_codes", "😂"]] },
      { from: "amir_codes", text: "Deal. Also here's the GIF I promised", ago: 4 * H, media: { gif: "thinking.gif", alt: "Animated purple text reading Studying with dots appearing one by one." } },
    ],
    readAgo: { maya_learns: 4 * H + 10, amir_codes: 4 * H - 5 },
  },
  {
    key: "robotics_group",
    kind: "GROUP",
    name: "Bolt build team",
    members: ["robotics_club", "maya_learns", "amir_codes", "zara_designs"],
    creator: "robotics_club",
    messages: [
      { from: "robotics_club", text: "Welcome to the Bolt build team chat! Use this for competition logistics.", ago: 3 * D },
      { from: "zara_designs", text: "I'll design the team badge. Blue and white?", ago: 3 * D - 60 },
      { from: "maya_learns", text: "Blue and white! Matches Bolt.", ago: 3 * D - 65 },
      { from: "amir_codes", text: "I pushed the new motor controller code. Please don't let Bolt near the stairs.", ago: 1 * D },
      { from: "robotics_club", text: "Photo from today's session", ago: 6 * H, media: { photo: "robot.jpg", alt: "Illustration of Bolt the blue robot." } },
      { from: "zara_designs", text: "He looks so proud", ago: 5 * H + 50, react: [["maya_learns", "❤️"], ["amir_codes", "❤️"]] },
    ],
    readAgo: { maya_learns: 1 * D, robotics_club: 5 * H, amir_codes: 5 * H + 40, zara_designs: 5 * H + 50 },
  },
  {
    key: "omar_request",
    kind: "DIRECT",
    members: ["omar_runs", "maya_learns"],
    creator: "omar_runs",
    requests: ["maya_learns"],
    messages: [{ from: "omar_runs", text: "Hi Maya! Coach Reyes said you might want to join the Saturday running group? We go slow, promise.", ago: 3 * H }],
    readAgo: { omar_runs: 3 * H },
  },
  {
    key: "maya_jordan",
    kind: "DIRECT",
    members: ["maya_learns", "jordan_private"],
    creator: "jordan_private",
    messages: [
      { from: "jordan_private", text: "Thanks for following back. I keep my account protected for my sketches.", ago: 6 * D },
      { from: "maya_learns", text: "Totally get it! Your hand studies are great.", ago: 6 * D - 20 },
    ],
    readAgo: { maya_learns: 6 * D - 20, jordan_private: 6 * D - 25 },
  },
  {
    key: "study_group",
    kind: "GROUP",
    name: "Calc II study group",
    members: ["maya_learns", "amir_codes", "theo_math", "priya_reads"],
    creator: "maya_learns",
    messages: [
      { from: "maya_learns", text: "Study group chat! Floor 3, 7pm Tuesday?", ago: 2 * D },
      { from: "theo_math", text: "Je serai là. I'll bring practice problems.", ago: 2 * D - 30 },
      { from: "priya_reads", text: "In! Can we do integration by parts first?", ago: 1 * D + 2 * H },
    ],
    readAgo: { maya_learns: 2 * D - 30, theo_math: 1 * D, amir_codes: 2 * D, priya_reads: 1 * D + 2 * H },
  },
];

export interface SeedList {
  key: string;
  owner: string;
  name: string;
  description: string;
  isPrivate?: boolean;
  members: string[];
  subscribers?: string[];
  pinnedBy?: string[];
  banner?: string;
}

export const SEED_LISTS: SeedList[] = [
  { key: "teachers", owner: "maya_learns", name: "Science teachers", description: "Teachers who make science fun.", members: ["prof_lindqvist", "chem_with_ana", "theo_math"], subscribers: ["stargazer_sam"], pinnedBy: ["maya_learns"], banner: "chalkboard.jpg" },
  { key: "close", owner: "maya_learns", name: "Close friends", description: "Private list — only I can see it.", isPrivate: true, members: ["amir_codes", "zara_designs", "jordan_private"] },
  { key: "makers", owner: "robotics_club", name: "Makers", description: "Builders, designers and tinkerers around campus.", members: ["maya_learns", "amir_codes", "zara_designs", "artby_kenji"], subscribers: ["maya_learns", "prof_lindqvist"], banner: "robot.jpg" },
  { key: "readers", owner: "priya_reads", name: "Book people", description: "Writers, readers and historians.", members: ["lucia_writes", "history_hub", "noor_debates"], subscribers: [] },
  { key: "jordan_private_list", owner: "jordan_private", name: "Art refs", description: "Private reference list.", isPrivate: true, members: ["artby_kenji", "eli_photos"] },
];

export interface SeedTopic {
  slug: string;
  name: string;
  category: string;
  description: string;
  keywords: string[];
  followers: string[];
}

export const SEED_TOPICS: SeedTopic[] = [
  { slug: "astronomy", name: "Astronomy", category: "Science", description: "Stars, planets, telescopes and observing nights.", keywords: ["astronomy", "telescope", "orbit", "moon", "planet", "observing"], followers: ["maya_learns", "stargazer_sam", "eli_photos"] },
  { slug: "robotics", name: "Robotics", category: "Technology", description: "Robots, builds and competitions.", keywords: ["robotics", "robot", "bolt", "motor"], followers: ["maya_learns", "amir_codes", "zara_designs"] },
  { slug: "coding", name: "Coding", category: "Technology", description: "Programming languages, tools and learning to code.", keywords: ["coding", "typescript", "rust", "compiler", "git"], followers: ["maya_learns", "amir_codes"] },
  { slug: "physics", name: "Physics", category: "Science", description: "Pendulums, forces and the rules of the universe.", keywords: ["physics", "pendulum", "midterm"], followers: ["prof_lindqvist"] },
  { slug: "chemistry", name: "Chemistry", category: "Science", description: "Reactions, labs and safety goggles.", keywords: ["chemistry", "titration", "goggles", "sodium"], followers: ["chem_with_ana"] },
  { slug: "mathematics", name: "Mathematics", category: "Science", description: "Puzzles, proofs and problem sets.", keywords: ["maths", "math", "proof", "calc", "énigme"], followers: ["theo_math", "sofia_chess"] },
  { slug: "creative-writing", name: "Creative writing", category: "Arts", description: "Prompts, stories and writing circles.", keywords: ["writing", "story", "escribir", "prompt"], followers: ["lucia_writes", "priya_reads"] },
  { slug: "photography", name: "Photography", category: "Arts", description: "Film, light and photo walks.", keywords: ["photography", "film", "exposure", "golden hour"], followers: ["eli_photos", "artby_kenji"] },
  { slug: "ceramics", name: "Ceramics & illustration", category: "Arts", description: "Clay, glaze and sketchbooks.", keywords: ["ceramics", "陶芸", "drawing", "sketch", "glaze"], followers: ["artby_kenji"] },
  { slug: "music", name: "Music", category: "Arts", description: "Bands, rehearsals and theory.", keywords: ["music", "jazz", "band"], followers: ["ben_music"] },
  { slug: "running", name: "Running", category: "Sports", description: "Track, trails and early mornings.", keywords: ["running", "run", "track"], followers: ["omar_runs", "coach_reyes"] },
  { slug: "soccer", name: "Soccer", category: "Sports", description: "Matches, pitches and practice.", keywords: ["soccer", "pitch", "match"], followers: ["coach_reyes"] },
  { slug: "chess", name: "Chess", category: "Games", description: "Openings, puzzles and club nights.", keywords: ["chess", "scacchi", "mate"], followers: ["sofia_chess"] },
  { slug: "sustainability", name: "Sustainability", category: "Community", description: "Compost, cycling and community gardens.", keywords: ["sustainability", "compost", "garden", "recycling", "bike"], followers: ["green_campus", "riley_locked"] },
  { slug: "debate", name: "Debate", category: "Community", description: "Motions, practice rounds and good-faith argument.", keywords: ["debate", "motion", "steelman"], followers: ["noor_debates"] },
  { slug: "history", name: "History", category: "Community", description: "Archives, yearbooks and stories from the past.", keywords: ["history", "archive", "yearbook", "libraries"], followers: ["history_hub", "priya_reads"] },
  { slug: "books", name: "Books", category: "Arts", description: "Book clubs and reading lists.", keywords: ["book", "bookclub", "reading", "library"], followers: ["priya_reads"] },
  { slug: "design", name: "Design", category: "Technology", description: "Grids, type and accessible colour.", keywords: ["design", "accessibility", "palette", "grid"], followers: ["zara_designs"] },
];

/** Curated (editorial) demo trends, clearly labelled as such in the UI. */
export const CURATED_TRENDS: { label: string; query: string; category: string; context: string }[] = [
  { label: "Observing night", query: "#astronomy", category: "Science", context: "Astronomy club meets Saturday at the east field" },
  { label: "Midterms", query: "midterm", category: "Learning", context: "Study tips and lab reminders" },
  { label: "#FirstPost", query: "#FirstPost", category: "Community", context: "New members introduce themselves" },
  { label: "Science fair", query: "science fair", category: "Learning", context: "Registration closes Friday" },
  { label: "New soccer pitch", query: "soccer pitch", category: "Sports", context: "Faculty vs. students on Monday" },
  { label: "Compost bins", query: "compost", category: "Community", context: "Back at the cafeteria" },
  { label: "Jazz band", query: "jazz", category: "Arts", context: "Rehearsal highlights" },
  { label: "#chess", query: "#chess", category: "Games", context: "Monday puzzle" },
];

export interface SeedMoment {
  key: string;
  owner: string;
  title: string;
  description: string;
  cover?: string;
  published: boolean;
  posts: string[];
}

export const SEED_MOMENTS: SeedMoment[] = [
  { key: "welcome_moment", owner: "ischoolie_team", title: "Welcome to iSchoolie", description: "A quick tour of how people use this demo network.", cover: "library.jpg", published: true, posts: ["welcome", "tips1", "tips2", "team_gif", "team_video", "guidelines"] },
  { key: "astro_moment", owner: "maya_learns", title: "Astronomy club, fall semester", description: "Clouds, clear skies and one great orbit demo.", cover: "night-sky.jpg", published: true, posts: ["sam_1", "maya_4", "prof_pend", "sam_3", "conv_5"] },
  { key: "draft_moment", owner: "maya_learns", title: "Robotics competition prep (draft)", description: "Collecting posts before publishing.", published: false, posts: ["rob_1", "maya_pin", "amir_quote"] },
  { key: "jordan_moment_protected", owner: "zara_designs", title: "Sketchbook inspiration", description: "Includes a protected post — only approved followers will see it.", published: true, posts: ["zara_2", "jordan_1", "kenji_2"] },
];

export const SEED_BOOKMARKS: [string, string][] = [
  ["maya_learns", "prof_2"],
  ["maya_learns", "zara_1"],
  ["maya_learns", "theo_deleted"],
  ["maya_learns", "ana_1"],
];

export const SEED_PINS: [string, string][] = [
  ["maya_learns", "maya_pin"],
  ["prof_lindqvist", "prof_pend"],
  ["ischoolie_team", "welcome"],
];

export const SEED_HIDDEN_REPLIES: string[] = ["hidden_reply"];

export const SEED_DRAFTS: { by: string; text: string }[] = [
  { by: "maya_learns", text: "Draft: robotics competition packing list — batteries, spare wheels, zip ties, more zip ties" },
];

export const SEED_SCHEDULED: { by: string; text: string; inMinutes: number; timezone: string }[] = [
  { by: "maya_learns", text: "Good luck to everyone at the robotics competition today! 🤖 (This post was scheduled in advance.)", inMinutes: 2 * D, timezone: "UTC" },
];

export const SEED_SAVED_SEARCHES: [string, string][] = [["maya_learns", "#astronomy"]];
export const SEED_RECENT_SEARCHES: [string, string][] = [["maya_learns", "robotics"], ["maya_learns", "Lindqvist"]];

export const SEED_VERSION = 1;
