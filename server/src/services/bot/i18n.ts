export type Lang = "en" | "te";

/**
 * Citizen-facing message catalogue (English / Telugu).
 * WhatsApp limits: button title ≤ 20 chars, list row title ≤ 24, row description ≤ 72, list button ≤ 20.
 */
const S = {
  langPrompt: {
    en: "🙏 Welcome to the citizen helpdesk of *{office}*.\nనమస్కారం! *{office}* పౌర సహాయ కేంద్రానికి స్వాగతం.\n\nPlease choose your language.\nదయచేసి మీ భాషను ఎంచుకోండి.",
    te: "",
  },
  sampleNote: {
    en: "_Demo workspace with sample branding — not an official MLA account._",
    te: "_ఇది నమూనా బ్రాండింగ్‌తో కూడిన డెమో వర్క్‌స్పేస్ — అధికారిక ఎమ్మెల్యే ఖాతా కాదు._",
  },
  welcome: {
    en: "🙏 Welcome to the official citizen helpdesk of *{office}*.\n{sample}\nHow can we assist you today?",
    te: "🙏 *{office}* అధికారిక పౌర సహాయ కేంద్రానికి స్వాగతం.\n{sample}\nఈ రోజు మేము మీకు ఎలా సహాయం చేయగలం?",
  },
  menuButton: { en: "Choose a service", te: "సేవను ఎంచుకోండి" },
  menuSection: { en: "Helpdesk services", te: "సహాయ కేంద్ర సేవలు" },
  menuFooter: { en: "Type *menu* anytime to return here", te: "ఎప్పుడైనా *menu* అని టైప్ చేయండి" },
  m_register: { en: "Register a complaint", te: "ఫిర్యాదు నమోదు" },
  m_register_d: { en: "Report a civic problem in your area", te: "మీ ప్రాంతంలోని సమస్యను తెలియజేయండి" },
  m_track: { en: "Track my complaint", te: "ఫిర్యాదు స్థితి" },
  m_track_d: { en: "Check status with your ticket number", te: "టికెట్ నంబర్‌తో స్థితి తెలుసుకోండి" },
  m_schemes: { en: "Scheme guidance", te: "పథకాల సమాచారం" },
  m_schemes_d: { en: "How to apply for government schemes", te: "ప్రభుత్వ పథకాలకు ఎలా దరఖాస్తు చేయాలి" },
  m_certs: { en: "Certificate guidance", te: "సర్టిఫికెట్ల సమాచారం" },
  m_certs_d: { en: "Income, caste, residence and more", te: "ఆదాయం, కుల, నివాస ధృవపత్రాలు మొదలైనవి" },
  m_appt: { en: "Request appointment", te: "అపాయింట్‌మెంట్ కోరండి" },
  m_appt_d: { en: "Request a meeting at the MLA office", te: "ఎమ్మెల్యే కార్యాలయంలో సమావేశం కోరండి" },
  m_contact: { en: "Contact the office", te: "కార్యాలయ సంప్రదింపు" },
  m_contact_d: { en: "Address, office hours and phone", te: "చిరునామా, పని వేళలు, ఫోన్" },
  m_lang: { en: "Change language", te: "భాష మార్చండి" },
  m_lang_d: { en: "తెలుగు / English", te: "తెలుగు / English" },

  btnMenu: { en: "Main menu", te: "ప్రధాన మెనూ" },
  btnSkip: { en: "Skip", te: "దాటవేయండి" },
  btnDone: { en: "Done", te: "పూర్తయింది" },
  btnCancel: { en: "Cancel", te: "రద్దు చేయండి" },
  more: { en: "More…", te: "మరిన్ని…" },
  moreD: { en: "Show more options", te: "మరిన్ని ఎంపికలు చూపించు" },
  chooseFromList: {
    en: "Please choose one of the options from the list below 👇",
    te: "దయచేసి క్రింది జాబితా నుండి ఒక ఎంపికను ఎంచుకోండి 👇",
  },
  langSet: { en: "✅ Language set to English.", te: "✅ భాష తెలుగుకు మార్చబడింది." },
  cancelled: { en: "Okay, cancelled. Nothing was submitted.", te: "సరే, రద్దు చేయబడింది. ఏదీ నమోదు కాలేదు." },
  unsupported: {
    en: "Sorry, I can read text messages, photos, PDF documents and shared locations only.",
    te: "క్షమించండి, నేను టెక్స్ట్ సందేశాలు, ఫోటోలు, PDF పత్రాలు మరియు లొకేషన్ మాత్రమే చదవగలను.",
  },
  mediaOutOfFlow: {
    en: "📎 Thanks! To attach photos or documents, please start *Register a complaint* from the menu — you can add them at step 7.",
    te: "📎 ధన్యవాదాలు! ఫోటోలు లేదా పత్రాలు జత చేయడానికి, మెనూ నుండి *ఫిర్యాదు నమోదు* ప్రారంభించండి — దశ 7లో జత చేయవచ్చు.",
  },
  firstPage: { en: "◀ Back to first page", te: "◀ మొదటి పేజీకి" },
  btnMyComplaints: { en: "My complaints", te: "నా ఫిర్యాదులు" },
  btnReplyNow: { en: "Reply now", te: "ఇప్పుడు సమాధానం" },
  attachedToCase: {
    en: "📎 File attached to complaint *{ticket}*.",
    te: "📎 ఫైల్ *{ticket}* ఫిర్యాదుకు జత చేయబడింది.",
  },
  voiceNotSupported: {
    en: "🎤 Voice notes are not yet enabled for this helpdesk (speech-to-text is not configured). Please type your message.",
    te: "🎤 ఈ సహాయ కేంద్రంలో వాయిస్ సందేశాలు ఇంకా అందుబాటులో లేవు. దయచేసి మీ సందేశాన్ని టైప్ చేయండి.",
  },
  voiceTranscribed: {
    en: "🎤 We converted your voice note to text:\n“{text}”",
    te: "🎤 మీ వాయిస్ సందేశాన్ని టెక్స్ట్‌గా మార్చాము:\n“{text}”",
  },

  optedOut: {
    en: "You have opted out of WhatsApp updates from this helpdesk. Send *START* anytime to opt back in.",
    te: "ఈ సహాయ కేంద్రం నుండి వాట్సాప్ అప్‌డేట్‌లను మీరు నిలిపివేశారు. మళ్లీ పొందడానికి *START* పంపండి.",
  },
  optedIn: {
    en: "✅ You will receive WhatsApp updates from this helpdesk again.",
    te: "✅ ఈ సహాయ కేంద్రం నుండి మీకు మళ్లీ వాట్సాప్ అప్‌డేట్‌లు వస్తాయి.",
  },

  // ── Complaint registration ─────────────────────────────
  resume: {
    en: "📝 You have an unfinished complaint (step: {step}). Would you like to continue where you left off?",
    te: "📝 మీ ఫిర్యాదు నమోదు పూర్తి కాలేదు (దశ: {step}). ఆగిన చోటు నుండి కొనసాగించాలా?",
  },
  btnContinue: { en: "Continue", te: "కొనసాగించండి" },
  btnStartNew: { en: "Start new", te: "కొత్తగా మొదలు" },
  consent: {
    en: "🔐 *Privacy notice*\nTo register your complaint, the MLA office will collect your name, WhatsApp number, location and complaint details (and any photos you send).\n\n• Used only to handle your grievance\n• Visible only to authorised office staff\n• Never used for political campaigning or unrelated messages\n• You can ask for your data to be deleted\n\nFull notice: {privacyUrl}\n\nDo you agree?",
    te: "🔐 *గోప్యతా సమాచారం*\nమీ ఫిర్యాదు నమోదు కోసం ఎమ్మెల్యే కార్యాలయం మీ పేరు, వాట్సాప్ నంబర్, ప్రాంతం, ఫిర్యాదు వివరాలు (మరియు మీరు పంపే ఫోటోలు) సేకరిస్తుంది.\n\n• మీ ఫిర్యాదు పరిష్కారానికి మాత్రమే ఉపయోగిస్తాము\n• అధికారిక కార్యాలయ సిబ్బందికి మాత్రమే కనిపిస్తుంది\n• రాజకీయ ప్రచారానికి లేదా సంబంధం లేని సందేశాలకు ఎప్పుడూ ఉపయోగించము\n• మీ సమాచారాన్ని తొలగించమని మీరు కోరవచ్చు\n\nపూర్తి వివరాలు: {privacyUrl}\n\nమీరు అంగీకరిస్తారా?",
  },
  btnAgree: { en: "I agree", te: "అంగీకరిస్తున్నాను" },
  btnDisagree: { en: "No, cancel", te: "వద్దు" },
  consentDeclined: {
    en: "Understood. We cannot register a complaint without your consent. You can still use scheme and certificate guidance from the menu.",
    te: "అర్థమైంది. మీ అంగీకారం లేకుండా ఫిర్యాదు నమోదు చేయలేము. మెనూలోని పథకాలు, సర్టిఫికెట్ల సమాచారాన్ని మీరు ఉపయోగించవచ్చు.",
  },
  askName: { en: "Step 1/8 · Please type your *full name*.", te: "దశ 1/8 · దయచేసి మీ *పూర్తి పేరు* టైప్ చేయండి." },
  askNameKnown: {
    en: "Step 1/8 · Shall we register this complaint under the name *{name}*?",
    te: "దశ 1/8 · ఈ ఫిర్యాదును *{name}* పేరుతో నమోదు చేయమంటారా?",
  },
  btnYes: { en: "Yes", te: "అవును" },
  btnChangeName: { en: "Change name", te: "పేరు మార్చండి" },
  badName: {
    en: "That doesn't look like a name. Please type your full name (2–60 letters).",
    te: "దయచేసి సరైన పూర్తి పేరు టైప్ చేయండి (2–60 అక్షరాలు).",
  },
  askMandal: {
    en: "Step 2/8 · 📍 Which *mandal* is the problem in?\nDistrict: {district} · Constituency: {constituency}",
    te: "దశ 2/8 · 📍 సమస్య ఏ *మండలం*లో ఉంది?\nజిల్లా: {district} · నియోజకవర్గం: {constituency}",
  },
  btnMandal: { en: "Select mandal", te: "మండలం ఎంచుకోండి" },
  askVillage: {
    en: "Step 3/8 · Select the *village or ward* in {mandal} mandal. If it's not listed, choose “Other”.",
    te: "దశ 3/8 · {mandal} మండలంలో *గ్రామం లేదా వార్డు* ఎంచుకోండి. జాబితాలో లేకపోతే “ఇతర” ఎంచుకోండి.",
  },
  btnVillage: { en: "Select village", te: "గ్రామం ఎంచుకోండి" },
  villageOther: { en: "Other (type name)", te: "ఇతర (పేరు టైప్ చేయండి)" },
  askVillageText: {
    en: "Please type the name of your village or ward.",
    te: "దయచేసి మీ గ్రామం లేదా వార్డు పేరు టైప్ చేయండి.",
  },
  askCategory: { en: "Step 4/8 · What type of problem is it?", te: "దశ 4/8 · సమస్య ఏ రకానికి చెందినది?" },
  btnCategory: { en: "Select category", te: "విభాగం ఎంచుకోండి" },
  askDescription: {
    en: "Step 5/8 · ✍️ Please *describe the problem* in your own words (Telugu or English). Mention how long it has been happening.",
    te: "దశ 5/8 · ✍️ దయచేసి *సమస్యను వివరించండి* (తెలుగు లేదా ఇంగ్లీష్‌లో). ఎంత కాలంగా ఉందో కూడా తెలపండి.",
  },
  shortDescription: {
    en: "Please add a little more detail (at least 15 characters) so the office can understand the problem.",
    te: "కార్యాలయం సమస్యను అర్థం చేసుకోవడానికి దయచేసి మరికొంత వివరంగా రాయండి (కనీసం 15 అక్షరాలు).",
  },
  duplicate: {
    en: "ℹ️ A similar *{category}* complaint from {village} is already registered: *{ticket}* (status: {status}, registered {date}).\n\nThe office will link related complaints. You can still register yours separately.",
    te: "ℹ️ {village} నుండి ఇలాంటి *{category}* ఫిర్యాదు ఇప్పటికే నమోదైంది: *{ticket}* (స్థితి: {status}, నమోదు {date}).\n\nసంబంధిత ఫిర్యాదులను కార్యాలయం అనుసంధానిస్తుంది. మీరు మీ ఫిర్యాదును విడిగా కూడా నమోదు చేయవచ్చు.",
  },
  btnRegisterMine: { en: "Register mine", te: "నా ఫిర్యాదు నమోదు" },
  askLandmark: {
    en: "Step 6/8 · Is there a nearby *landmark*? (e.g. near bus stand, temple, school). Type it, or tap Skip.",
    te: "దశ 6/8 · దగ్గరలో ఏదైనా *గుర్తు ప్రదేశం* ఉందా? (ఉదా: బస్టాండ్, గుడి, పాఠశాల దగ్గర). టైప్ చేయండి లేదా దాటవేయండి నొక్కండి.",
  },
  askLocation: {
    en: "📌 Optional: share the exact *location* using 📎 → Location. Share only if you are comfortable. Or tap Skip.",
    te: "📌 ఐచ్ఛికం: 📎 → Location ద్వారా ఖచ్చితమైన *ప్రదేశాన్ని* పంపండి. మీకు ఇష్టమైతేనే పంపండి. లేదా దాటవేయండి నొక్కండి.",
  },
  locationSaved: { en: "📍 Location received. Thank you.", te: "📍 ప్రదేశం అందింది. ధన్యవాదాలు." },
  askMedia: {
    en: "Step 7/8 · 📷 Optional: send up to 3 *photos or PDF documents* (max {mb} MB each). Tap Done when finished, or Skip.",
    te: "దశ 7/8 · 📷 ఐచ్ఛికం: గరిష్టంగా 3 *ఫోటోలు లేదా PDF పత్రాలు* పంపండి (ఒక్కొక్కటి {mb} MB లోపు). పూర్తయ్యాక “పూర్తయింది” నొక్కండి, లేదా దాటవేయండి.",
  },
  mediaReceived: {
    en: "✅ Received {n} of 3. Send more, or tap Done.",
    te: "✅ 3లో {n} అందాయి. మరిన్ని పంపండి లేదా “పూర్తయింది” నొక్కండి.",
  },
  mediaLimit: { en: "You have already attached 3 files.", te: "మీరు ఇప్పటికే 3 ఫైళ్లు జత చేశారు." },
  mediaRejected: { en: "⚠️ That file could not be accepted: {reason}", te: "⚠️ ఆ ఫైల్ స్వీకరించలేకపోయాము: {reason}" },
  askUrgency: { en: "Step 8/8 · How urgent is this problem?", te: "దశ 8/8 · ఈ సమస్య ఎంత అత్యవసరం?" },
  u_NORMAL: { en: "Normal", te: "సాధారణం" },
  u_URGENT: { en: "Urgent", te: "అత్యవసరం" },
  u_SAFETY: { en: "⚠️ Safety risk", te: "⚠️ ప్రమాదం ఉంది" },
  safetyNote: {
    en: "⚠️ If anyone is in immediate danger, please call *112* (national emergency number) right away. This helpdesk is not an emergency service.",
    te: "⚠️ ఎవరైనా తక్షణ ప్రమాదంలో ఉంటే, వెంటనే *112* (జాతీయ అత్యవసర నంబర్)కు కాల్ చేయండి. ఈ సహాయ కేంద్రం అత్యవసర సేవ కాదు.",
  },
  confirm: {
    en: "📝 *Please confirm your complaint*\n\n*Name:* {name}\n*Mobile:* {mobile} (your WhatsApp number)\n*District:* {district}\n*Constituency:* {constituency}\n*Mandal:* {mandal}\n*Village/Ward:* {village}\n*Category:* {category}\n*Landmark:* {landmark}\n*Location:* {location}\n*Attachments:* {attachments}\n*Urgency:* {urgency}\n\n*Problem:* {description}",
    te: "📝 *దయచేసి మీ ఫిర్యాదును నిర్ధారించండి*\n\n*పేరు:* {name}\n*మొబైల్:* {mobile} (మీ వాట్సాప్ నంబర్)\n*జిల్లా:* {district}\n*నియోజకవర్గం:* {constituency}\n*మండలం:* {mandal}\n*గ్రామం/వార్డు:* {village}\n*విభాగం:* {category}\n*గుర్తు ప్రదేశం:* {landmark}\n*ప్రదేశం:* {location}\n*జతలు:* {attachments}\n*అత్యవసరత:* {urgency}\n\n*సమస్య:* {description}",
  },
  notProvided: { en: "Not provided", te: "ఇవ్వలేదు" },
  shared: { en: "Shared ✓", te: "పంపారు ✓" },
  btnSubmit: { en: "✅ Submit", te: "✅ సమర్పించండి" },
  btnStartOver: { en: "Start over", te: "మళ్లీ ప్రారంభించండి" },
  submitted: {
    en: "✅ *Complaint registered*\n\n*Ticket number:* {ticket}\n*Submitted:* {time}\n*Current status:* Received\n\n*Next step:* The MLA office team will verify your complaint and forward it to the responsible team. You will receive updates here on WhatsApp.\n\nℹ️ This complaint is registered with the MLA office helpdesk. It has *not* been filed with any government department, and we cannot promise a resolution date at this stage.\n\nPlease save your ticket number. Type *menu* for more options.",
    te: "✅ *ఫిర్యాదు నమోదైంది*\n\n*టికెట్ నంబర్:* {ticket}\n*సమర్పించిన సమయం:* {time}\n*ప్రస్తుత స్థితి:* స్వీకరించబడింది\n\n*తదుపరి దశ:* ఎమ్మెల్యే కార్యాలయ బృందం మీ ఫిర్యాదును పరిశీలించి సంబంధిత బృందానికి పంపుతుంది. అప్‌డేట్‌లు ఇక్కడే వాట్సాప్‌లో వస్తాయి.\n\nℹ️ ఈ ఫిర్యాదు ఎమ్మెల్యే కార్యాలయ సహాయ కేంద్రంలో నమోదైంది. ఇది ఏ ప్రభుత్వ శాఖలోనూ దాఖలు *కాలేదు*, మరియు ఈ దశలో పరిష్కార తేదీని హామీ ఇవ్వలేము.\n\nదయచేసి మీ టికెట్ నంబర్‌ను భద్రపరచుకోండి. మరిన్ని ఎంపికల కోసం *menu* టైప్ చేయండి.",
  },
  submitFailed: {
    en: "⚠️ Sorry, we could not save your complaint due to a technical problem. Your details are kept — please tap Submit again in a few minutes.",
    te: "⚠️ క్షమించండి, సాంకేతిక సమస్య వల్ల మీ ఫిర్యాదును సేవ్ చేయలేకపోయాము. మీ వివరాలు భద్రంగా ఉన్నాయి — కొద్ది నిమిషాల తర్వాత మళ్లీ సమర్పించండి నొక్కండి.",
  },

  // ── Tracking ───────────────────────────────────────────
  trackPick: {
    en: "📋 Select a complaint to see its status, or type your ticket number.",
    te: "📋 స్థితి చూడడానికి ఒక ఫిర్యాదును ఎంచుకోండి, లేదా మీ టికెట్ నంబర్ టైప్ చేయండి.",
  },
  btnTickets: { en: "My complaints", te: "నా ఫిర్యాదులు" },
  typeTicketRow: { en: "Type a ticket number", te: "టికెట్ నంబర్ టైప్ చేయండి" },
  askTicket: {
    en: "Please type your ticket number (for example {example}).",
    te: "దయచేసి మీ టికెట్ నంబర్ టైప్ చేయండి (ఉదాహరణ: {example}).",
  },
  noTickets: {
    en: "We couldn't find any complaints registered from this WhatsApp number.",
    te: "ఈ వాట్సాప్ నంబర్ నుండి నమోదైన ఫిర్యాదులు ఏవీ కనుగొనబడలేదు.",
  },
  ticketNotFound: {
    en: "We couldn't find ticket *{ticket}* for this WhatsApp number. Please check the number and try again.",
    te: "ఈ వాట్సాప్ నంబర్‌కు *{ticket}* టికెట్ కనుగొనబడలేదు. దయచేసి నంబర్ సరిచూసి మళ్లీ ప్రయత్నించండి.",
  },
  ticketStatus: {
    en: "📋 *{ticket}*\n*Category:* {category}\n*Village:* {village}\n*Registered:* {created}\n*Status:* {status}\n*Handled by:* {team}\n*Last update:* {last}",
    te: "📋 *{ticket}*\n*విభాగం:* {category}\n*గ్రామం:* {village}\n*నమోదు:* {created}\n*స్థితి:* {status}\n*బాధ్యత:* {team}\n*చివరి అప్‌డేట్:* {last}",
  },
  notAssigned: { en: "Not yet assigned", te: "ఇంకా అప్పగించలేదు" },
  noUpdates: { en: "No updates yet", te: "ఇంకా అప్‌డేట్‌లు లేవు" },
  resolvedAsk: { en: "Has your problem been solved?", te: "మీ సమస్య పరిష్కారమైందా?" },
  btnSolved: { en: "👍 Yes, solved", te: "👍 పరిష్కారమైంది" },
  btnNotSolved: { en: "Not solved", te: "పరిష్కారం కాలేదు" },
  awaitingAsk: {
    en: "The office is waiting for more information from you. Please type your reply now and it will be added to your complaint.",
    te: "కార్యాలయం మీ నుండి మరింత సమాచారం కోసం వేచి ఉంది. దయచేసి మీ సమాధానం ఇప్పుడు టైప్ చేయండి, అది మీ ఫిర్యాదుకు జత చేయబడుతుంది.",
  },
  infoAdded: {
    en: "✅ Thank you. Your reply has been added to complaint *{ticket}* and the office has been informed.",
    te: "✅ ధన్యవాదాలు. మీ సమాధానం *{ticket}* ఫిర్యాదుకు జత చేయబడింది, కార్యాలయానికి తెలియజేశాము.",
  },
  askRating: {
    en: "Thank you for confirming! 🙏 How would you rate the support you received?",
    te: "నిర్ధారించినందుకు ధన్యవాదాలు! 🙏 మీకు అందిన సహాయాన్ని ఎలా రేట్ చేస్తారు?",
  },
  btnRate: { en: "Rate", te: "రేటింగ్ ఇవ్వండి" },
  rating5: { en: "⭐⭐⭐⭐⭐ Excellent", te: "⭐⭐⭐⭐⭐ అద్భుతం" },
  rating4: { en: "⭐⭐⭐⭐ Good", te: "⭐⭐⭐⭐ బాగుంది" },
  rating3: { en: "⭐⭐⭐ Okay", te: "⭐⭐⭐ పర్వాలేదు" },
  rating2: { en: "⭐⭐ Poor", te: "⭐⭐ బాగాలేదు" },
  rating1: { en: "⭐ Very poor", te: "⭐ చాలా బాగాలేదు" },
  thanksFeedback: {
    en: "🙏 Thank you for your feedback. Complaint *{ticket}* is now closed.",
    te: "🙏 మీ అభిప్రాయానికి ధన్యవాదాలు. *{ticket}* ఫిర్యాదు ముగించబడింది.",
  },
  askReopen: {
    en: "We're sorry the problem is not solved. Please briefly describe what is still pending.",
    te: "సమస్య పరిష్కారం కానందుకు చింతిస్తున్నాము. ఇంకా ఏమి మిగిలి ఉందో క్లుప్తంగా తెలపండి.",
  },
  reopened: {
    en: "🔁 Complaint *{ticket}* has been reopened and sent back to the office for review. You will receive updates here.",
    te: "🔁 *{ticket}* ఫిర్యాదు మళ్లీ తెరవబడింది మరియు సమీక్ష కోసం కార్యాలయానికి పంపబడింది. అప్‌డేట్‌లు ఇక్కడే వస్తాయి.",
  },

  // ── Guidance ───────────────────────────────────────────
  guidancePickScheme: {
    en: "📘 Select a scheme to see general guidance on how to apply.",
    te: "📘 దరఖాస్తు విధానం గురించి సాధారణ సమాచారం కోసం ఒక పథకాన్ని ఎంచుకోండి.",
  },
  guidancePickCert: {
    en: "📄 Select a certificate to see general guidance on how to apply.",
    te: "📄 దరఖాస్తు విధానం గురించి సాధారణ సమాచారం కోసం ఒక సర్టిఫికెట్‌ను ఎంచుకోండి.",
  },
  btnView: { en: "View list", te: "జాబితా చూడండి" },
  noGuidance: {
    en: "No guidance articles have been published by the office yet.",
    te: "కార్యాలయం ఇంకా ఎలాంటి సమాచారాన్ని ప్రచురించలేదు.",
  },
  guidanceBody: {
    en: "*{title}*\n{summary}\n\n*How to apply:*\n{steps}\n\n*Documents usually needed:*\n{docs}\n\n*Official source:* {source}\n{url}\n*Last verified by office:* {verified}\n\nℹ️ This is information guidance only — not an application, approval or eligibility decision. Eligibility is decided by the concerned department.",
    te: "*{title}*\n{summary}\n\n*దరఖాస్తు విధానం:*\n{steps}\n\n*సాధారణంగా అవసరమైన పత్రాలు:*\n{docs}\n\n*అధికారిక మూలం:* {source}\n{url}\n*కార్యాలయం చివరిసారి ధృవీకరించిన తేదీ:* {verified}\n\nℹ️ ఇది కేవలం సమాచారం మాత్రమే — దరఖాస్తు, ఆమోదం లేదా అర్హత నిర్ణయం కాదు. అర్హతను సంబంధిత శాఖ నిర్ణయిస్తుంది.",
  },
  notVerified: {
    en: "Not yet verified — sample content, confirm at the official source",
    te: "ఇంకా ధృవీకరించలేదు — నమూనా సమాచారం, అధికారిక మూలంలో సరిచూసుకోండి",
  },
  btnOtherSchemes: { en: "Other schemes", te: "ఇతర పథకాలు" },
  btnOtherCerts: { en: "Other certificates", te: "ఇతర సర్టిఫికెట్లు" },

  // ── Appointment ────────────────────────────────────────
  askApptPurpose: {
    en: "🗓️ Please briefly describe the *purpose* of your meeting with the MLA office.",
    te: "🗓️ ఎమ్మెల్యే కార్యాలయంతో సమావేశం *ఉద్దేశ్యాన్ని* క్లుప్తంగా తెలపండి.",
  },
  shortPurpose: { en: "Please write a little more (at least 5 characters).", te: "దయచేసి కొంచెం ఎక్కువగా రాయండి (కనీసం 5 అక్షరాలు)." },
  askApptDate: { en: "Which day would you prefer?", te: "మీకు ఏ రోజు అనుకూలం?" },
  btnDate: { en: "Choose a day", te: "రోజు ఎంచుకోండి" },
  askApptSlot: { en: "Which time would you prefer?", te: "మీకు ఏ సమయం అనుకూలం?" },
  slotMorning: { en: "Morning (10–12)", te: "ఉదయం (10–12)" },
  slotAfternoon: { en: "Afternoon (2–4)", te: "మధ్యాహ్నం (2–4)" },
  slotEvening: { en: "Evening (4–6)", te: "సాయంత్రం (4–6)" },
  apptRequested: {
    en: "🗓️ *Appointment request recorded*\nReference: *{ref}*\nPreferred: {date}, {slot}\n\nThis is a request, not a confirmed appointment. The office will confirm the date and time with you here on WhatsApp.",
    te: "🗓️ *అపాయింట్‌మెంట్ అభ్యర్థన నమోదైంది*\nరిఫరెన్స్: *{ref}*\nకోరిన సమయం: {date}, {slot}\n\nఇది అభ్యర్థన మాత్రమే, నిర్ధారిత అపాయింట్‌మెంట్ కాదు. కార్యాలయం తేదీ, సమయాన్ని ఇక్కడే వాట్సాప్‌లో నిర్ధారిస్తుంది.",
  },

  // ── Contact ────────────────────────────────────────────
  contact: {
    en: "🏛️ *{office}*\n{sample}\n*Address:* {address}\n*Office hours:* {hours}\n*Phone:* {phone}\n\nPrivacy notice: {privacyUrl}",
    te: "🏛️ *{office}*\n{sample}\n*చిరునామా:* {address}\n*పని వేళలు:* {hours}\n*ఫోన్:* {phone}\n\nగోప్యతా సమాచారం: {privacyUrl}",
  },

  // ── Proactive notifications (office → citizen) ─────────
  n_ASSIGNED: {
    en: "📌 Update on *{ticket}*: your complaint has been verified and assigned to the *{team}*.",
    te: "📌 *{ticket}* అప్‌డేట్: మీ ఫిర్యాదు పరిశీలించబడి *{team}*కు అప్పగించబడింది.",
  },
  n_VERIFICATION: {
    en: "🔎 Update on *{ticket}*: the office is verifying your complaint.",
    te: "🔎 *{ticket}* అప్‌డేట్: కార్యాలయం మీ ఫిర్యాదును పరిశీలిస్తోంది.",
  },
  n_IN_PROGRESS: {
    en: "🛠️ Update on *{ticket}*: work on your complaint is in progress.",
    te: "🛠️ *{ticket}* అప్‌డేట్: మీ ఫిర్యాదుపై పని జరుగుతోంది.",
  },
  n_AWAITING_INFO: {
    en: "❓ Update on *{ticket}*: the office needs more information.\n\n{note}\n\nPlease reply via *Track my complaint* in the menu.",
    te: "❓ *{ticket}* అప్‌డేట్: కార్యాలయానికి మరింత సమాచారం అవసరం.\n\n{note}\n\nదయచేసి మెనూలోని *ఫిర్యాదు స్థితి* ద్వారా సమాధానం ఇవ్వండి.",
  },
  n_RESOLVED: {
    en: "✅ Update on *{ticket}*: the office has marked your complaint as *resolved*.\n\n{note}\n\nHas your problem been solved?",
    te: "✅ *{ticket}* అప్‌డేట్: కార్యాలయం మీ ఫిర్యాదును *పరిష్కరించినట్లు* గుర్తించింది.\n\n{note}\n\nమీ సమస్య పరిష్కారమైందా?",
  },
  n_CLOSED: {
    en: "📁 Complaint *{ticket}* has been closed by the office.\n{note}",
    te: "📁 *{ticket}* ఫిర్యాదును కార్యాలయం ముగించింది.\n{note}",
  },
  n_REOPENED: {
    en: "🔁 Complaint *{ticket}* has been reopened by the office for further action.",
    te: "🔁 తదుపరి చర్య కోసం *{ticket}* ఫిర్యాదును కార్యాలయం మళ్లీ తెరిచింది.",
  },
  n_NOTE: { en: "💬 Message from the MLA office about *{ticket}*:\n\n{note}", te: "💬 *{ticket}* గురించి ఎమ్మెల్యే కార్యాలయం సందేశం:\n\n{note}" },
  n_APPT_CONFIRMED: {
    en: "🗓️ Your appointment *{ref}* is confirmed for *{when}*.\n{note}\nPlease bring any relevant documents.",
    te: "🗓️ మీ అపాయింట్‌మెంట్ *{ref}* *{when}*కు నిర్ధారించబడింది.\n{note}\nసంబంధిత పత్రాలు వెంట తీసుకురండి.",
  },
  n_APPT_CANCELLED: {
    en: "🗓️ Your appointment request *{ref}* could not be scheduled.\n{note}",
    te: "🗓️ మీ అపాయింట్‌మెంట్ అభ్యర్థన *{ref}* షెడ్యూల్ చేయలేకపోయాము.\n{note}",
  },
} as const;

export type MsgKey = keyof typeof S;

export function t(lang: Lang, key: MsgKey, vars: Record<string, string | number> = {}): string {
  const entry = S[key] as { en: string; te: string };
  let s = (lang === "te" ? entry.te : entry.en) || entry.en;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
