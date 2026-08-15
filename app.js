import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { adminEmails, firebaseConfig } from "./firebase-config.js";

const storageKey = "campus-placement-drives-v2";
const apiKeyStorageKey = "campus-placement-gemini-key";
const modelStorageKey = "campus-placement-gemini-model";
const localAiOnlyStorageKey = "campus-placement-local-ai-only";
const localDataOnlyStorageKey = "campus-placement-local-data-only";
const hasFirebaseConfig = !Object.values(firebaseConfig).some((value) => String(value).startsWith("PASTE_"));
const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = firebaseApp ? getAuth(firebaseApp) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;
const provider = new GoogleAuthProvider();

const sampleMessage = `Dear Students,

TCS Ninja is conducting an on-campus placement drive for 2026 batch.
Role: Graduate Trainee / Software Engineer
Package: 3.36 LPA
Eligible branches: CSE, IT, ECE
Criteria: 60% and above in 10th, 12th and B.Tech, no active backlogs.
Selection process: Online aptitude test, coding test, technical interview and HR interview.
Skills expected: C, Java or Python, DBMS, OOPs, basic data structures, communication.
Last date to register: 22 August 2026.
Location: PAN India.
Interested eligible students must fill the registration form shared in the group.`;

const defaults = [
  analyzeMessage(sampleMessage, "All eligible students"),
];

const elements = {
  message: document.querySelector("#tpoMessage"),
  audience: document.querySelector("#manualAudience"),
  analyze: document.querySelector("#analyzeBtn"),
  seed: document.querySelector("#seedBtn"),
  clear: document.querySelector("#clearBtn"),
  list: document.querySelector("#driveList"),
  template: document.querySelector("#driveTemplate"),
  search: document.querySelector("#searchInput"),
  branch: document.querySelector("#branchFilter"),
  total: document.querySelector("#totalCount"),
  topPackage: document.querySelector("#avgPackage"),
  apiKey: document.querySelector("#apiKey"),
  model: document.querySelector("#modelName"),
  localAiOnly: document.querySelector("#localAiOnly"),
  localDataOnly: document.querySelector("#localDataOnly"),
  aiStatus: document.querySelector("#aiStatus"),
  signinScreen: document.querySelector("#signinScreen"),
  signinStatus: document.querySelector("#signinStatus"),
  googleLogin: document.querySelector("#googleLoginBtn"),
  logout: document.querySelector("#logoutBtn"),
  userChip: document.querySelector("#userChip"),
  studentPanel: document.querySelector("#studentPanel"),
  adminPanel: document.querySelector("#adminPanel"),
  lock: document.querySelector("#lockBtn"),
};

let drives = loadDrives();
let editingDriveId = null;
let isOwner = false;
let currentUser = null;
let unsubscribeDrives = null;
elements.apiKey.value = localStorage.getItem(apiKeyStorageKey) || "";
elements.model.value = localStorage.getItem(modelStorageKey) || "gemini-2.5-flash";
elements.localAiOnly.checked = localStorage.getItem(localAiOnlyStorageKey) === "true";
elements.localDataOnly.checked = localStorage.getItem(localDataOnlyStorageKey) === "true";

function loadDrives() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    return Array.isArray(saved) && saved.length ? saved : defaults;
  } catch {
    return defaults;
  }
}

function saveDrives() {
  localStorage.setItem(storageKey, JSON.stringify(drives));
}

function setOwnerMode(enabled) {
  isOwner = enabled;
  document.body.classList.toggle("owner-mode", enabled);
  elements.studentPanel.hidden = enabled;
  elements.adminPanel.hidden = !enabled;
  elements.userChip.textContent = currentUser ? currentUser.email : "Signed in";
  if (!enabled) {
    editingDriveId = null;
    elements.message.value = "";
    elements.analyze.textContent = "Generate placement brief";
  }
  render();
}

function setSignedInView(user) {
  currentUser = user;
  document.body.classList.toggle("signed-in", Boolean(user));
  elements.signinScreen.hidden = Boolean(user);
  elements.userChip.textContent = user ? user.email : "Signed out";
  setOwnerMode(Boolean(user && adminEmails.map((email) => email.toLowerCase()).includes(user.email.toLowerCase())));
}

function listenToDrives() {
  if (!db || unsubscribeDrives || elements.localDataOnly.checked) return;
  const drivesQuery = query(collection(db, "placementDrives"), orderBy("createdAt", "desc"));
  unsubscribeDrives = onSnapshot(drivesQuery, (snapshot) => {
    if (elements.localDataOnly.checked) return;
    drives = snapshot.docs.map((driveDoc) => ({ id: driveDoc.id, ...driveDoc.data() }));
    render();
  }, (error) => {
    console.error(error);
    elements.signinStatus.textContent = "Could not load placement drives. Check Firestore rules and config.";
  });
}

function stopListeningToDrives() {
  if (!unsubscribeDrives) return;
  unsubscribeDrives();
  unsubscribeDrives = null;
}

function useLocalDrives() {
  stopListeningToDrives();
  drives = loadDrives();
  render();
}

async function saveDrive(drive) {
  const localSave = () => {
    const driveToSave = editingDriveId ? { ...drive, id: editingDriveId } : drive;
    drives = editingDriveId
      ? drives.map((item) => item.id === editingDriveId ? driveToSave : item)
      : [driveToSave, ...drives];
    editingDriveId = null;
    saveDrives();
    render();
  };

  if (!db || elements.localDataOnly.checked) {
    localStorage.setItem(localDataOnlyStorageKey, String(elements.localDataOnly.checked));
    localSave();
    elements.aiStatus.textContent = "Saved locally in this browser. Firebase was not used.";
    return;
  }

  const payload = {
    ...drive,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser?.email || "unknown",
  };

  if (editingDriveId) {
    await setDoc(doc(db, "placementDrives", editingDriveId), payload, { merge: true });
    editingDriveId = null;
    elements.aiStatus.textContent = "Updated in Firebase.";
  } else {
    await addDoc(collection(db, "placementDrives"), {
      ...payload,
      createdAt: serverTimestamp(),
      createdBy: currentUser?.email || "unknown",
    });
    elements.aiStatus.textContent = "Saved in Firebase.";
  }
}

async function clearAllDrives() {
  if (!db || elements.localDataOnly.checked) {
    drives = [];
    saveDrives();
    render();
    return;
  }
  const snapshot = await getDocs(collection(db, "placementDrives"));
  await Promise.all(snapshot.docs.map((driveDoc) => deleteDoc(doc(db, "placementDrives", driveDoc.id))));
}

function clean(text) {
  return String(text || "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFirst(text, patterns, fallback = "Not mentioned") {
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) return clean(found[1] || found[0]).replace(/[.;,]$/, "");
  }
  return fallback;
}

function titleCase(text) {
  return clean(text).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getLines(message) {
  return message.split(/\n+/).map(clean).filter(Boolean);
}

function stripUrls(message) {
  return message.replace(/https?:\/\/\S+/gi, "");
}

function extractFieldBlock(message, label) {
  const lines = getLines(message);
  const start = lines.findIndex((line) => new RegExp(`^${label}\\s*:`, "i").test(line));
  if (start === -1) return "";

  const sameLine = lines[start].replace(new RegExp(`^${label}\\s*:\\s*`, "i"), "").trim();
  const values = sameLine ? [sameLine] : [];

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z][A-Za-z\s/()-]{2,32}\s*:/.test(line)) break;
    values.push(line.replace(/^\d+\.\s*/, ""));
  }

  return clean(values.join("; "));
}

function extractCompany(message) {
  const lines = getLines(message);
  const titleLine = lines.find((line) => />>.+<</.test(line));
  if (titleLine) {
    const title = titleLine.replace(/[<>|]/g, " ").split(/\bbatch\b/i)[0];
    const cleaned = clean(title);
    if (cleaned) return titleCase(cleaned);
  }

  const companyLine = lines.find((line) => /^[A-Z][A-Za-z0-9&.\s-]{2,50}\s+(is|are)\s+/i.test(line));
  if (companyLine) {
    return titleCase(companyLine.split(/\s+(is|are)\s+/i)[0]);
  }

  const messageWithoutUrls = stripUrls(message);
  const fromKnown = messageWithoutUrls.match(/\b(TCS|Infosys|Wipro|Accenture|Capgemini|Cognizant|Deloitte|IBM|HCL|Tech Mahindra|Amazon|Microsoft|LTIMindtree|Hexaware|Zoho)\b/i);
  if (fromKnown) return titleCase(fromKnown[0]);

  const driveLine = lines.find((line) => /drive|visiting|hiring|recruitment|campus/i.test(line));
  if (driveLine) {
    return clean(driveLine.replace(/dear students,?/i, "").split(/\bis\b|\bare\b|\bwill\b|\bvisiting\b|\bhiring\b/i)[0]) || "Company not detected";
  }
  return lines[0] ? lines[0].slice(0, 42) : "Company not detected";
}

function extractBranches(message) {
  const branches = [];
  const branchMap = [
    ["CSE", /\b(CSE|CS|Computer Science)\b/i],
    ["IT", /\bIT\b|Information Technology/i],
    ["ECE", /\bECE\b|Electronics/i],
    ["ECC", /\bECC\b/i],
    ["EEE", /\bEEE\b|Electrical/i],
    ["MCA", /\bMCA\b/i],
    ["Mechanical", /\bMECH|Mechanical/i],
    ["Civil", /\bCivil\b/i],
  ];
  branchMap.forEach(([label, pattern]) => {
    if (pattern.test(message)) branches.push(label);
  });
  return branches.length ? [...new Set(branches)].join(", ") : "Check official message";
}

function extractPackage(message) {
  const ctcBlock = extractFieldBlock(message, "CTC");
  if (ctcBlock) {
    const packages = [...ctcBlock.matchAll(/([A-Za-z\s()/-]*?(?:APE|ASA|Trainee|Intern)?[A-Za-z\s()/-]*?[-:]\s*)?([0-9.]+\s*(?:LPA|lakhs?|K|per month|pm))/gi)]
      .map((match) => clean(`${match[1] || ""}${match[2]}`))
      .filter(Boolean);
    if (packages.length) return packages.join("; ");
  }

  return matchFirst(message, [
    /(?:package|ctc|salary|stipend)\s*[:\-]?\s*([0-9.]+\s*(?:lpa|lakhs?|k|per month|pm|ctc))/i,
    /([0-9.]+\s*(?:lpa|lakhs?)\b)/i,
  ], "Not mentioned");
}

function extractRole(message) {
  const designation = extractFieldBlock(message, "Job Designation");
  if (designation) {
    return designation
      .replace(/\b\d+\.\s*/g, "")
      .replace(/\s*;\s*/g, "; ");
  }

  return matchFirst(message, [
    /(?:role|profile|designation|position|job title)\s*[:\-]?\s*([A-Za-z0-9 /()&+-]{3,})/i,
    /(software engineer|graduate trainee|system engineer|analyst|developer|associate|trainee engineer|business analyst|data analyst|support engineer)/i,
  ], "Role to be confirmed");
}

function extractProcess(message) {
  const process = [];
  [
    ["Aptitude", /aptitude|quant|logical|verbal/i],
    ["Technical test", /technical test/i],
    ["Coding", /coding|programming|data structures|dsa/i],
    ["Technical interview", /technical interview|technical round|tr/i],
    ["Personal interview", /personal interview|pi\b/i],
    ["HR interview", /hr interview|hr round/i],
    ["Group discussion", /group discussion|gd/i],
  ].forEach(([label, pattern]) => {
    if (pattern.test(message)) process.push(label);
  });
  return process;
}

function buildPrep(message, role, process) {
  const prep = new Set();
  if (/aptitude|quant|logical|verbal/i.test(message)) {
    ["Quantitative aptitude", "Logical reasoning", "Verbal ability"].forEach((item) => prep.add(item));
  }
  if (/coding|software|developer|engineer|java|python|c\+\+|dbms|oops|data structures|dsa/i.test(`${message} ${role}`)) {
    ["Basic coding", "OOPs", "DBMS", "Data structures", "Resume projects"].forEach((item) => prep.add(item));
  }
  if (/no-code|paas|platform|fintech|lending|bfsi|solution analyst/i.test(`${message} ${role}`)) {
    ["Fintech basics", "SQL basics", "Platform workflows", "Requirement analysis"].forEach((item) => prep.add(item));
  }
  if (/data analyst|analytics|sql|excel|power bi/i.test(`${message} ${role}`)) {
    ["SQL", "Excel basics", "Data interpretation", "Dashboard project"].forEach((item) => prep.add(item));
  }
  if (/communication|hr|interview/i.test(message) || process.length) {
    ["Self introduction", "HR questions", "Company research"].forEach((item) => prep.add(item));
  }
  if (!prep.size) {
    ["Read the role carefully", "Revise resume projects", "Practice aptitude", "Prepare HR answers"].forEach((item) => prep.add(item));
  }
  return [...prep].slice(0, 8);
}

function analyzeMessage(message, audience) {
  const role = extractRole(message);
  const process = extractProcess(message);
  const company = extractCompany(message);
  const branches = extractBranches(message);
  const packageText = extractPackage(message);

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    company,
    role,
    packageText,
    branches,
    audience,
    summary: `${company} is hiring for ${role.toLowerCase()}. The drive is for eligible students to enter a trainee or intern track, with final selection depending on the official criteria, rounds and internship/job conditions mentioned by the TPO.`,
    prep: buildPrep(message, role, process),
    original: message,
    createdAt: new Date().toISOString(),
  };
}

function beginEdit(driveId) {
  const drive = drives.find((item) => item.id === driveId);
  if (!drive) return;
  editingDriveId = driveId;
  elements.message.value = drive.original;
  elements.audience.value = drive.audience;
  elements.analyze.textContent = "Update placement brief";
  elements.message.focus();
}

async function deleteDrive(driveId) {
  if (db && !elements.localDataOnly.checked) {
    await deleteDoc(doc(db, "placementDrives", driveId));
    return;
  }
  drives = drives.filter((drive) => drive.id !== driveId);
  saveDrives();
  render();
}

function normalizeAiDrive(aiDrive, message, audience) {
  const fallback = analyzeMessage(message, audience);
  const prep = Array.isArray(aiDrive.prep) ? aiDrive.prep.filter(Boolean) : fallback.prep;

  return {
    ...fallback,
    company: clean(aiDrive.company) || fallback.company,
    role: clean(aiDrive.role) || fallback.role,
    packageText: clean(aiDrive.packageText) || fallback.packageText,
    branches: clean(aiDrive.branches) || fallback.branches,
    summary: clean(aiDrive.summary) || fallback.summary,
    prep: prep.length ? prep.slice(0, 8) : fallback.prep,
    original: message,
    audience,
  };
}

async function analyzeWithAi(message, audience) {
  if (elements.localAiOnly.checked) {
    localStorage.setItem(localAiOnlyStorageKey, "true");
    elements.aiStatus.textContent = "Used local extractor only. Gemini was not called.";
    return analyzeMessage(message, audience);
  }

  localStorage.setItem(localAiOnlyStorageKey, "false");
  const apiKey = elements.apiKey.value.trim();
  const model = elements.model.value.trim() || "gemini-2.5-flash";

  if (!apiKey) {
    elements.aiStatus.textContent = "No API key found, so I used the local extractor.";
    return analyzeMessage(message, status, audience);
  }

  localStorage.setItem(apiKeyStorageKey, apiKey);
  localStorage.setItem(modelStorageKey, model);
  elements.aiStatus.textContent = "Gemini is reading the TPO message...";

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Extract campus placement drive details for Indian college students. Return only valid JSON with these exact keys: company, role, packageText, branches, summary, prep. The prep value must be an array of 5 to 8 specific topics, skills, technologies, or interview rounds the student should prepare, based EXACTLY on what the company wants and the selection process mentioned in the message. Keep unknown details as "Not mentioned".\n\nTPO message:\n${message}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            company: { type: "string" },
            role: { type: "string" },
            packageText: { type: "string" },
            branches: { type: "string" },

            summary: { type: "string" },
            prep: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["company", "role", "packageText", "branches", "summary", "prep"],
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Gemini request failed with error ${response.status}`);
  }

  const data = await response.json();
  const outputText = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const aiDrive = JSON.parse(outputText);
  elements.aiStatus.textContent = "Gemini brief generated successfully.";
  return normalizeAiDrive(aiDrive, message, audience);
}

async function analyzeWithOpenAi(message, audience) {
  const apiKey = elements.apiKey.value.trim();
  const model = elements.model.value.trim() || "gpt-4.1-mini";

  if (!apiKey) {
    elements.aiStatus.textContent = "No API key found, so I used the local extractor.";
    return analyzeMessage(message, audience);
  }

  localStorage.setItem(apiKeyStorageKey, apiKey);
  localStorage.setItem(modelStorageKey, model);
  elements.aiStatus.textContent = "OpenAI is reading the TPO message...";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "Extract campus placement drive details for Indian college students. Return only valid JSON.",
        },
        {
          role: "user",
          content: `Read this TPO message and return JSON with these exact keys: company, role, packageText, branches, summary, prep. The prep value must be an array of 5 to 8 short topics students should prepare. Keep unknown details as "Not mentioned".\n\nTPO message:\n${message}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "placement_drive",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              company: { type: "string" },
              role: { type: "string" },
              packageText: { type: "string" },
              branches: { type: "string" },

              summary: { type: "string" },
              prep: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["company", "role", "packageText", "branches", "summary", "prep"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `AI request failed with error ${response.status}`);
  }

  const data = await response.json();
  const outputText = data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text).join("");
  const aiDrive = JSON.parse(outputText);
  elements.aiStatus.textContent = "AI brief generated successfully.";
  return normalizeAiDrive(aiDrive, message, audience);
}

function packageNumber(packageText) {
  const number = packageText.match(/[0-9.]+/);
  return number ? Number(number[0]) : 0;
}

function render() {
  const query = elements.search.value.toLowerCase();
  const branch = elements.branch.value;
  const filtered = drives.filter((drive) => {
    const haystack = `${drive.company} ${drive.role} ${drive.branches} ${drive.packageText} ${drive.prep.join(" ")}`.toLowerCase();
    const branchMatch = branch === "all" || drive.branches.toLowerCase().includes(branch);
    return haystack.includes(query) && branchMatch;
  });

  elements.total.textContent = String(drives.length);

  const top = drives.reduce((best, drive) => Math.max(best, packageNumber(drive.packageText)), 0);
  elements.topPackage.textContent = top ? `${top} LPA` : "--";

  elements.list.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No placement drives match this view yet.";
    elements.list.append(empty);
    return;
  }

  filtered.forEach((drive) => {
    const node = elements.template.content.cloneNode(true);
    node.querySelector(".company").textContent = drive.company;
    node.querySelector(".role").textContent = drive.role;

    node.querySelector(".package").textContent = drive.packageText;
    node.querySelector(".branches").textContent = drive.branches;

    node.querySelector(".summary").textContent = drive.summary;
    node.querySelector(".original").textContent = drive.original;
    if (isOwner) {
      const actions = document.createElement("div");
      actions.className = "card-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => beginEdit(drive.id));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.className = "danger-button";
      deleteButton.addEventListener("click", () => deleteDrive(drive.id));

      actions.append(editButton, deleteButton);
      node.querySelector(".drive-card").append(actions);
    }
    const prepList = node.querySelector(".prep-list");
    drive.prep.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      prepList.append(li);
    });
    elements.list.append(node);
  });
}

elements.analyze.addEventListener("click", async () => {
  const message = elements.message.value.trim();
  if (!message) {
    elements.message.focus();
    return;
  }

  elements.analyze.disabled = true;
  elements.analyze.textContent = "Generating...";
  let drive;
  try {
    drive = await analyzeWithAi(message, elements.audience.value);
  } catch (error) {
    console.error(error);
    elements.aiStatus.textContent = `AI failed, so I used the local extractor. ${friendlyError(error)}`;
    drive = analyzeMessage(message, elements.audience.value);
  }

  try {
    await saveDrive(drive);
  } catch (error) {
    console.error(error);
    elements.aiStatus.textContent = `Could not save to Firebase, so I saved locally in this browser. ${friendlyError(error)}`;
    const fallbackDrive = { ...drive, id: editingDriveId || drive.id };
    const wasEditing = editingDriveId;
    drives = wasEditing
      ? drives.map((item) => item.id === wasEditing ? fallbackDrive : item)
      : [fallbackDrive, ...drives];
    editingDriveId = null;
    saveDrives();
    render();
  } finally {
    elements.analyze.disabled = false;
    elements.analyze.textContent = "Generate placement brief";
  }

  elements.message.value = "";
  render();
});

function friendlyError(error) {
  const message = String(error?.message || error || "");
  if (/permission|PERMISSION_DENIED|Missing or insufficient permissions/i.test(message)) {
    return "Firebase rejected the write. Check Firestore rules and admin email.";
  }
  if (/API key|key not valid|403|PERMISSION_DENIED/i.test(message)) {
    return "The Gemini key may be invalid, restricted, deleted, or not enabled for this API.";
  }
  if (/model|not found|404/i.test(message)) {
    return "The selected Gemini model may not be available for this key.";
  }
  if (/Failed to fetch|NetworkError|CORS/i.test(message)) {
    return "The browser could not reach the API.";
  }
  return "Open the browser console for the exact error.";
}

elements.seed.addEventListener("click", () => {
  elements.message.value = sampleMessage;
  elements.message.focus();
});

elements.clear.addEventListener("click", async () => {
  await clearAllDrives();
});

elements.lock.addEventListener("click", () => {
  setOwnerMode(false);
});

elements.googleLogin.addEventListener("click", async () => {
  if (!auth) {
    elements.signinStatus.textContent = "Add your Firebase config first, then reload this page.";
    return;
  }
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    elements.signinStatus.textContent = "Google login failed. Check that Google provider is enabled in Firebase Auth.";
  }
});

elements.logout.addEventListener("click", async () => {
  if (auth) await signOut(auth);
});

elements.search.addEventListener("input", render);
elements.branch.addEventListener("change", render);

if (auth) {
  onAuthStateChanged(auth, (user) => {
    setSignedInView(user);
    if (user) {
      if (elements.localDataOnly.checked) {
        useLocalDrives();
      } else {
        listenToDrives();
      }
    }
    if (!user) {
      stopListeningToDrives();
      drives = [];
      render();
    }
  });
} else {
  elements.signinStatus.textContent = "Open firebase-config.js and paste your Firebase web app details.";
  setSignedInView(null);
}

elements.localDataOnly.addEventListener("change", () => {
  localStorage.setItem(localDataOnlyStorageKey, String(elements.localDataOnly.checked));
  if (elements.localDataOnly.checked) {
    useLocalDrives();
    elements.aiStatus.textContent = "Local save mode is on. Firebase will not overwrite these drafts.";
  } else {
    drives = [];
    render();
    listenToDrives();
    elements.aiStatus.textContent = "Firebase save mode is on.";
  }
});
