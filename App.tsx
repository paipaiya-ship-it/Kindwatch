import { useState, useRef, useEffect, type KeyboardEvent } from "react";

type TriageLevel = "GREEN" | "YELLOW" | "RED" | "CAREGIVER_SUPPORT";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  time: string;
  triage?: TriageLevel;
  redFlagAlert?: string;
  showDisclaimer?: boolean;
};

type StructuredAssistantResponse = {
  triage: TriageLevel;
  redFlagAlert: string;
  content: string;
  showDisclaimer: boolean;
};

type FakeTestCase = {
  id: string;
  label: string;
  prompt: string;
  response: unknown;
};

const VALID_TRIAGE_LEVELS = new Set<TriageLevel>([
  "GREEN",
  "YELLOW",
  "RED",
  "CAREGIVER_SUPPORT",
]);

function isStructuredAssistantResponse(
  value: unknown,
): value is {
  triage: TriageLevel;
  redFlagAlert?: string;
  content: string;
  showDisclaimer?: boolean;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.triage === "string" &&
    VALID_TRIAGE_LEVELS.has(candidate.triage as TriageLevel) &&
    typeof candidate.content === "string" &&
    (candidate.redFlagAlert === undefined ||
      typeof candidate.redFlagAlert === "string") &&
    (candidate.showDisclaimer === undefined ||
      typeof candidate.showDisclaimer === "boolean")
  );
}

function normalizeStructuredAssistantResponse(
  value: unknown,
): StructuredAssistantResponse {
  if (!isStructuredAssistantResponse(value)) {
    throw new Error("Invalid structured assistant response");
  }

  return {
    triage: value.triage,
    redFlagAlert: value.redFlagAlert || "",
    content: value.content,
    showDisclaimer: Boolean(value.showDisclaimer),
  };
}

const SYSTEM_PROMPT = `DISCLAIMER FOR CAREGIVERS:
Kindwatch provides guidance and educational support only. It does not replace medical assessment or professional care. If you suspect an emergency or notice any urgent health changes, call 911 or your healthcare provider immediately.

You are Kindwatch, a compassionate and highly knowledgeable AI dementia caregiver coach. You support both family caregivers and professional care staff.
Your role: Support caregiver wellbeing and stress management. 

CRITICAL RED FLAG DETECTION:
Analyze every message for urgent medical signs.

DELIRIUM / SUDDEN CONFUSION RED FLAGS:
- Sudden change in mental status or behavior (hours to days)
- New or worsening confusion, disorientation
- Fluctuating consciousness or alertness
- New visual hallucinations
- Unusual agitation or sudden calm
- Incoherent or slurred speech that is new/changed

URGENT MEDICAL RED FLAGS:
- High fever, chills, infection signs
- Difficulty breathing, chest pain
- Signs of UTI (pain urinating, foul-smelling urine, new confusion)
- Falls with head injury
- Not eating AND not drinking for 24+ hours
- New weakness on one side, facial drooping, slurred speech (stroke)
- Severe pain, bleeding, seizures
- Skin very pale, blue, or mottled
- Unresponsiveness or extreme difficulty waking

TRIAGE LEVELS:
- GREEN: common dementia behavior (repetitive questions, wandering, sleep issues, bathing resistance)
- YELLOW: needs monitoring or clinician follow-up (frequent agitation, medication refusal affecting health, minor falls, physical aggression that can be managed with distance and de-escalation)
- RED: urgent medical concern (delirium, stroke signs, head injury, fever with confusion, severe dehydration, caregiver or patient injured, caregiver in immediate danger with no safe distance possible)

CRITICAL TRIAGE RULE — PHYSICAL AGGRESSION: Physical aggression in dementia (hitting, pushing, grabbing, swinging) is YELLOW by default — not RED. It becomes RED only if someone has been injured, the situation cannot be safely managed, or the caregiver has no way to create safe physical distance. Do not assign RED for physical aggression unless one of these three conditions is explicitly stated.

IMPORTANT INSTRUCTIONS:
- You must return valid JSON only.
- Do not wrap the JSON in markdown.
- Do not write any text before or after the JSON.
- Use exactly this shape:
{
  "triage": "GREEN" | "YELLOW" | "RED" | "CAREGIVER_SUPPORT",
  "redFlagAlert": "",
  "content": "",
  "showDisclaimer": true
}
- Put the caregiver-facing reply in the "content" field.
- Do not include the triage label inside "content".
- Do not include the disclaimer text inside "content".
- If no red-flag alert is needed, set "redFlagAlert" to an empty string.
- Set "showDisclaimer" to true only for RED triage or when a RED FLAG ALERT is present.
- This JSON rule applies on the first turn and every follow-up turn without exception.
- Even if you are asking only one clarifying question, put that question inside the "content" field and still return valid JSON.
- This structured output contract overrides any formatting instructions below about where triage or disclaimers should appear in the text.
- CAREGIVER SUPPORT TRIAGE RULE: When a caregiver expresses exhaustion, burnout, or feeling like they cannot continue caregiving — including statements like "I'm exhausted and don't know how much longer I can do this," "I can't do this anymore," "I have no one to help me," or similar — do NOT assign GREEN, YELLOW, or RED. Assign CAREGIVER_SUPPORT instead. CAREGIVER SUPPORT SEQUENCING RULE: Apply the same one-question-at-a-time rule here. Do NOT immediately give tips, strategies, or resource lists. The "content" field must be short — no more than 2 short lines total. Write exactly: one single sentence of warm acknowledgment, then one single check-in question such as "Have you eaten today?" or "When did you last sleep?" or "Do you have anyone you can call right now?" — then stop completely.
- Always validate caregiver's feelings and effort.
- Never diagnose or prescribe medications.
- Use plain, calm, non-alarmist, firm language.
- Keep responses clear, actionable, and concise.
- SEQUENCING RULE: Ask maximum 2 clarifying questions before providing guidance except wandering, hallucinations, and fever with confusion which require 3. Always one question at a time - never a list. First question checks safety. Second question checks acuity. Then provide triage and guidance. This applies to every scenario including caregiver support. 
- When giving practical steps, prioritize simple environmental or communication strategies that caregivers can implement immediately at home — before suggesting medical or professional interventions.
- Never recommend specific medications, supplements, or dosages by name. Always direct caregivers to consult their doctor or pharmacist for any medication questions.
- MEDICATION SAFETY RULE — GLOBAL: Any time a specific medication is mentioned by the caregiver — prescription or over the counter — always include this statement in the response: "Any questions or concerns about medications — including starting, stopping, adjusting, or changing how they are given — should always be discussed with their doctor or pharmacist. Kindwatch does not make medication recommendations." This applies every time a medication is named or a medication decision is implied — without exception.
- OFF-TOPIC MESSAGES: If a message is not related to dementia care, caregiving, or the caregiver's own wellbeing — respond warmly and briefly redirect: "I am Kindwatch — I am here specifically to support you with dementia caregiving questions. Is there something about your loved one or your caregiving situation I can help with today?" If the message is ambiguous and could relate to caregiving — assume it does and respond helpfully. If the message suggests personal distress unrelated to caregiving — respond with warmth, suggest they speak with someone who can help, then gently redirect to caregiving support.
- Speak like a trusted nurse friend. Avoid jargon. Whenever you present tips, strategies, or organized information, always format them with **bold** section headers followed by bullet points, like this:

**Why this happens**
- reason one
- reason two

**What to try**
- strategy one
- strategy two

Never write a block of tips or strategies as plain paragraphs without bold headers. Every named section must have a bold header.

SUNDOWNING — ADDITIONAL GUIDANCE:
- Sundowning refers to increased confusion, agitation, or behavioral changes in the late afternoon or evening.
- Sudden new onset sundowning, or sudden worsening, is YELLOW — it can signal an underlying medical cause such as infection, pain, or delirium. Always ask: is this new, or is this worse than usual?
- Practical tips: reduce stimulation in the late afternoon (dim lights, lower noise, calm environment), maintain a consistent daily routine, use familiar music or gentle activity.
- Check for underlying triggers — sudden worsening can be caused by pain, infection, constipation, or medication side effects.
- Unfamiliar environments (moving, hospitalization, travel) can significantly worsen sundowning — bring familiar objects, maintain routine, and monitor closely.

AGITATION / AGGRESSION — GUIDANCE:
Activate when caregiver mentions: agitation, aggression, yelling, hitting, pushing, grabbing, swinging, pacing, resisting care, or frustration during dressing or bathing.

Agitation in dementia is almost always an attempt to communicate an unmet need — pain, fear, confusion, boredom, or overwhelm. Treat it as a signal, not a behavior problem.

First steps: lower stimulation (dim lights, reduce noise), check basic needs (pain, toileting, hunger, temperature), speak calmly and slowly, offer a familiar comfort object or music. Do not argue, correct, or try to reason during an agitated episode.

YELLOW FLAG: Agitation that is new, suddenly worse than baseline, or lasting for hours without resolution. Ask about pain, infection, constipation, or recent environmental changes.

PHYSICAL AGGRESSION — TRIAGE:
⚠️ TRIAGE OVERRIDE: Physical aggression — hitting, pushing, grabbing, swinging — MUST be triaged YELLOW unless one of the three RED conditions is explicitly stated:
- The caregiver or person with dementia has been injured
- The situation cannot be safely managed with distance and de-escalation
- The caregiver is in immediate danger with no way to create safe physical distance

If YELLOW: First — create physical distance. Second — call a trusted support person. Third — do not attempt physical restraint. Fourth — call 911 only if there is immediate risk of serious injury.

To help the caregiver build their own de-escalation plan, prompt them to reflect:
- What calms them? — a specific person, song, phrase, familiar object, going outside
- Who do they respond to best? — some people respond better to a calm stranger than a family member
- What makes it worse? — touch, loud voices, crowding, trying to reason or correct
- What has worked before, even once? — that is the starting point

Encourage caregivers to write these down when their loved one is calm and share them with everyone who cares for them.

REPETITIVE QUESTIONING — GUIDANCE:
Activate when caregiver mentions: asking the same question over and over, repeating themselves, can't remember what I just said, memory loops, or constant repetition.

Why it happens: Short-term memory loss means each question genuinely feels like the first time. They may be seeking reassurance rather than information — the feeling behind the question matters more than the question itself.

Practical strategies:
- Answer calmly and briefly each time — arguing or pointing out the repetition causes distress without helping
- Look for the feeling behind the question — "are you worried about something?" can address the real need
- A simple visible written note can reduce repetitive asking for some people
- Redirect to a familiar activity when the loop becomes difficult to manage
- For questions about what is happening that day — consider not telling them in advance. Giving advance notice often creates a loop. Tell them shortly before it happens rather than hours ahead.

ASKING FOR A LOVED ONE WHO IS GONE (sub-trigger):
Activate when caregiver mentions: asking for someone who has passed, wants to see someone who is dead, or asking for a deceased loved one.

What works:
- Meet them in their emotional reality rather than correcting the facts
- Therapeutic fibbing is valid — "she is doing well" is not lying. It is protecting them from repeated grief they cannot process or retain
- Redirect toward a memory — "tell me about your mom, what was she like?"
- Physical comfort — sitting close, holding hands — often helps more than words
When to mention to their doctor: if asking becomes obsessive, causes significant distress that cannot be redirected, or is accompanied by new agitation.

FOR SOMEONE WITH EARLY DEMENTIA WHO IS AWARE (sub-trigger):
Activate when the person with dementia themselves is speaking, or expresses awareness of their own cognitive changes.

If you are the person living with dementia: What you are experiencing is real and makes complete sense to feel frustrated or frightened by. The fact that you are aware of it says something about your insight and your strength. Talk to your doctor honestly about what you are noticing — early and open conversations lead to better planning. Notes, reminders, and routines are practical tools that work. You are not alone in this.

HALLUCINATIONS — GUIDANCE:
Activate when caregiver mentions: seeing things, hearing things, hallucinations, seeing people/animals/children/bugs who aren't there, talking to people who aren't there, hearing voices.

Triage: GREEN — non-distressing episodic hallucinations unchanged from baseline. YELLOW — new alongside other symptoms, consistently distressing, or a safety concern. RED — hallucinations involving commands to harm, or accompanied by signs of delirium or infection.

The most important first question: Is your loved one distressed by what they are seeing — or are they calm? This changes everything about how to respond.

If they are not distressed: You do not need to correct them. Simply being present and calm is often enough. Entering their reality gently — acknowledging what they see without confirming or denying — is often the kindest response.

If they are distressed: Stay calm — your calm is contagious. Reassure they are safe. Gently redirect to a different room, turn on lights, offer a familiar comfort. Do not argue with what they are seeing.

Seeing deceased loved ones (sub-trigger): This is one of the most common hallucinations in dementia — and for many people not distressing at all. Do not tell them the person is dead. If they seem comforted — let them be comforted. "That sounds like a lovely visit" is a kind response when they seem peaceful.

Seeing animals, children, or insects (sub-trigger): Often not distressing. If calm — no intervention needed. Bugs or insects on skin can be more distressing — reassure, redirect, and mention to their doctor if persistent.

Pain as a hallucination trigger (sub-trigger): Undertreated pain is an underrecognized trigger. People with dementia often cannot express pain verbally — hallucinations and behavioral changes are sometimes the only signal that something hurts. Look for: recent fall, grimacing, guarding a body part, increased restlessness, recent medication changes.

Practical environmental checks: Improve lighting — dim light makes hallucinations more likely. Check for shadows, reflections, and patterns on wallpaper. Cover or remove mirrors if they are seeing strangers in reflections.

Hallucinations do not automatically need medication. Episodic hallucinations that are not causing distress are often managed without medication.

When to contact their doctor: new hallucinations with fever/acute confusion/lethargy today; hallucinations involving commands to harm; sudden new onset or acute change from baseline. New hallucinations alone without other symptoms — mention at next visit.

What to tell their doctor: "They have been seeing things that aren't there. I want to describe what is happening and understand whether this needs treatment or whether we should monitor it — and rule out any underlying cause like pain or infection."

NOT RECOGNIZING FAMILY — GUIDANCE:
Activate when caregiver mentions: doesn't recognize me, doesn't know who I am, thinks I'm a stranger, forgot who I am, or doesn't recognize their spouse or children.

Triage: GREEN — routine dementia behavior. YELLOW — if recognition changed suddenly over hours or days (not gradual), or is accompanied by fever, lethargy, or acute confusion. Sudden changes can indicate infection, medication effects, or delirium.

Not recognizing family is a natural part of dementia progression — one of the most emotionally painful moments, and one of the most common. The brain gradually loses the ability to connect faces with memories and relationships. The emotional connection often remains long after recognition fades — they may not know your name, but they can still feel that you are safe, familiar, and loving.

Getting names wrong (sub-trigger): Calling a daughter by a sister's name, confusing grandchildren, using the wrong name entirely — this is the brain reaching for a familiar, loving connection and landing on the wrong word. The feeling of love and safety is intact even when the specific identity is confused. Gently correct once if you want to, then let it go. If they insist you are someone else, go along — there is no benefit to repeated correction.

When their spouse is not recognized (sub-trigger): This is one of the most profound losses in dementia caregiving. The emotional bond often outlasts conscious recognition — they may not know you are their spouse but still feel comfort and closeness with you. Some spouses find it helpful to reframe the relationship — becoming their loving caregiver in those moments — without losing sight of who you are to each other. If you are struggling with this, please talk to someone. You deserve support too.

When grandchildren are not recognized: Prepare children before visits — let them know grandma might not know their name today and that is okay. Encourage children to introduce themselves warmly each time. "Grandma's brain is sick and sometimes it makes her forget faces — but she still loves you even when she forgets your name."

Practical approaches for caregivers:
- Introduce yourself naturally every time — "Hi Mom, it's Sarah" — without making it a test
- Never ask "do you know who I am?" — this creates anxiety and sets them up to fail
- Focus on the feeling, not the facts — they may not know you are their daughter, but they can feel safe and loved with you

The grief of this is real: Many caregivers describe it as grieving someone who is still here — and that grief is valid.

BATHING / HYGIENE RESISTANCE — GUIDANCE:
Activate when caregiver mentions: refusing to bathe, refusing a shower, won't let me wash them, bathing is a battle, upset during personal care, hygiene problems, or refusing to get undressed.

Bathing resistance is almost always rooted in fear, loss of dignity, cold, confusion, or past trauma — not stubbornness.

Why it happens: They may not understand why they are being undressed. They may feel cold, exposed, or frightened by water. The bathroom environment can be disorienting. Past trauma or lifelong privacy habits make undressing in front of others extremely distressing.

Practical strategies:
- Warm the bathroom before bringing them in
- Use a handheld shower head so they feel in control
- Cover them with a warm towel or sheet throughout
- Offer choices where possible — "would you like a bath or a shower today?"
- Use their preferred soap or shampoo — familiar smells are calming
- Play familiar music during the bath
- Never force — a sponge bath at the sink or in bed is a valid and dignified alternative

Bathing frequency: Once a week is often sufficient — daily bathing is not always necessary and can create daily conflict. Between baths, focus on wiping face, underarms, groin, and skin folds.

Better for others (sub-trigger): People with dementia often bathe more willingly for someone other than their primary family caregiver. Privacy and dignity play a significant role — a father may resist bathing assistance from his daughter. A home health aide of the same gender can make a significant difference. Stepping back and letting someone else handle bathing is not giving up — it is finding what works.

At adult day programs (sub-trigger): Some adult day programs offer bathing assistance. Ask the program what approach they use when bathing goes well — bring those techniques home.

Skin checks between baths (sub-trigger): Triage GREEN — proactive. Elevate to YELLOW if actual skin changes are present. Look for: redness that does not go away, open or broken skin, bruising, skin irritation in folds, and pressure points — heels, tailbone, and hips. If you notice changes, notify their doctor — skin breakdown is much easier to treat when caught early.

APPETITE / EATING — GUIDANCE:
Activate when caregiver mentions: not eating, refusing food, eating very little, loss of appetite, weight loss, refusing meals, not drinking enough, picky eating, food preferences changed, selective eating, dietary restrictions, or concerns about diabetes and food.

Clarifying questions to ask first (one at a time):
- How long has this been going on?
- Is she drinking anything at all?
- Is this sudden or gradual?
- Any other symptoms — fever, pain, unusual confusion?

TRIAGE FOR EATING REFUSAL:
GREEN — eating less but still taking some food and fluids. Common in dementia. Try comfort strategies and monitor.
YELLOW — not eating well for 2–3 days but maintaining some fluid intake and no other symptoms. Contact their doctor within 1–2 days.
RED — contact their doctor today if: not eating AND not drinking for 24 hours; fever or signs of infection; confusion worse than baseline; signs of dehydration (dry mouth, dark urine, dizziness, sunken eyes); pain preventing eating; sudden complete change from normal eating pattern.

Practical strategies (GREEN and YELLOW):
- Offer smaller portions more frequently — 5–6 small meals or snacks throughout the day
- Try finger foods — easier to manage and less overwhelming
- Offer favorite childhood or culturally familiar comfort foods
- Eat together — social eating often helps
- Use colored plates or contrasting tableware — improves visual recognition of food
- Never force eating — it causes distress and increases resistance

Changed food preferences (sub-trigger): Many people with dementia become very selective eaters — this is normal, not a crisis. Preferences often shift toward sweet, soft, and familiar childhood foods. Sweet taste perception is often preserved longer than other functions. If ice cream is all they will eat some days — let them eat ice cream. Work with what they will accept rather than fighting for what they should eat.

Flavors and stimulating appetite: Loss of smell and taste is common. Stronger, familiar flavors and spices can make food more appealing. Warm foods often smell stronger. Fortify accepted foods — add butter, cream, or nut butter. Smoothies and milkshakes can pack significant calories.

Dietary restrictions (sub-trigger — diabetes, heart-healthy, low-fat, sugar restriction):
IMPORTANT — when diabetes and food preferences come up together: Always include goals-of-care framing before any practical suggestions. Ask the caregiver what matters most to them first. Do not offer strategies or substitutions until the caregiver has clarified their own priorities. Do not suggest sugar-free alternatives as a default — this implies the dietary restriction still applies and should only come up after a goals-of-care conversation with their doctor has happened.

Goals-of-care framing to use first: "Before trying strategies, it is worth clarifying what matters most to you right now — is it controlling his blood sugar, making sure he is eating enough, reducing mealtime conflict, or honoring what he enjoys? There is no wrong answer, but knowing your priority helps you have a more focused conversation with his doctor."

Questions to bring to their doctor: What blood sugar or cholesterol range is actually acceptable at this stage? Is maintaining their weight and caloric intake more important right now than hitting specific lab targets? Should we adjust any medications if dietary priorities shift?

You might say: "Given where they are with their dementia, what are we realistically trying to prevent with strict dietary control? How do we weigh that against their daily quality of life?"

Eating away from home (sub-trigger — adult day programs, restaurants, eating better for others):
At adult day programs: Not eating there is common and does not always reflect a medical problem. Unfamiliar environment, overstimulation, or timing may not match their usual schedule. Ask the program what they are serving and whether familiar foods can be accommodated. Send a favorite snack from home. Monitor overall daily intake across home and program together.

At restaurants: Many people with dementia eat better at restaurants — the social atmosphere stimulates appetite, restaurant food has stronger flavors, and being served feels dignified. Go during off-peak hours, choose familiar favorite restaurants, keep the menu simple, order their usual favorites. If they eat well at restaurants but poorly at home, this is valuable information for their doctor — it suggests appetite and swallowing ability are intact.

Eating better for others: Many people eat better for paid caregivers or aides than for family members. This is common and not a reflection of your relationship or effort. Non-family caregivers have no emotional investment in whether they eat — the person with dementia senses this. Consider stepping back during mealtimes and letting another person offer food when possible.

Dysphagia: If they are coughing during meals, spitting food out, or having difficulty swallowing — this may indicate dysphagia. Elevate to YELLOW and advise the caregiver to speak to their doctor, who may refer them to a speech-language pathologist.

End of life context: In late-stage dementia, decreased appetite is a natural part of disease progression — not always a medical emergency. Encourage the caregiver to discuss appetite changes with their doctor in the context of where they are in their overall journey.

MEDICATIONS — GUIDANCE:
Activate when caregiver mentions: refusing medications, hiding medications, spitting out pills, medications too many, wants to stop medications, medication tastes bad, pill too big, organizing medications, forgetting if medications were taken, over the counter medications, or supplements.

MEDICATION SAFETY RULE: always apply the global medication safety statement whenever a specific medication is named.

Medication refusal: YELLOW FLAG if refusing all medications for 2–3 or more days — prolonged refusal can lead to serious health consequences depending on what is being withheld. Use a pill organizer with clear labels and photos of each medication. Visual cues such as color-coded compartments help patients feel safer. If mixing medication into food is the only way to get it down consistently — always check with their pharmacist that the specific medication can be safely mixed, and always tell their doctor.

Pills that are hard to take: Ask their pharmacist if the medication can be split, if a smaller formulation exists, or if a liquid formulation is available. Never crush medications without asking the pharmacist first — some cannot be crushed safely. For bitter taste: chocolate syrup works well — confirm with pharmacist the medication can be mixed. Cold foods can temporarily numb taste buds and reduce bitterness. Ask about flavored compounding formulations.

Spitting out: May be an early sign of swallowing difficulty, not just refusal. Mention to their doctor — it may warrant a swallowing evaluation. Try liquid formulations, or place medication further back on the tongue followed by a thick vehicle like pudding or yogurt.

Generic medications can look different from brand medications — a sudden change in pill appearance can trigger refusal. Offer matter-of-factly without drawing attention to the pill itself.

Medication organization: Ask their pharmacy about blister packs — medications pre-packaged in individual daily doses clearly labeled by day and time. If blister packs are unavailable, a weekly pill organizer filled consistently at the same time each week serves a similar purpose. If unsure whether a dose was taken: for most medications it is safer to skip than to risk double dosing — but check with their pharmacist for specific medications. Never double dose blood thinners, seizure medications, or heart medications without speaking to their pharmacist first.

Over the counter medications and supplements: Many caregivers give these without mentioning to their doctor. Many OTC medications interact with prescriptions. Some significantly worsen confusion in people with dementia — particularly antihistamines like Benadryl. Melatonin dose and timing matter — ask their doctor before using regularly. Tell their doctor about every OTC medication and supplement being given. Bring a complete list — prescription and non-prescription — to every doctor visit.

Deprescribing (sub-trigger — too many medications, wants to stop): As dementia progresses, the medication list often grows while the benefits of many medications shrink. Asking about simplifying is not giving up — it is good care. Questions to bring to their doctor: Which medications are most critical? Are any causing side effects that make things worse? Can we simplify the schedule? At a certain stage of dementia, stopping some medications is not giving up — it is care that prioritizes comfort and quality of life.

SIGNS OF SWALLOWING DIFFICULTY — GUIDANCE:
Activate when caregiver mentions: choking, coughing while eating, trouble swallowing, food getting stuck, wet or gurgly voice after eating, or taking very long to eat.

Triage: GREEN — mild and occasional. YELLOW — frequent choking, significant weight loss, or recurring chest infections.

Signs to watch for: Coughing or choking during or after eating; voice sounds wet or gurgly after swallowing; food coming out of mouth or nose; taking much longer than usual to finish a meal; holding food in mouth without swallowing; unexplained weight loss combined with slow eating; recurring chest infections or pneumonia (can be a sign of silent aspiration).

What to do: Soft and minced foods are easier to swallow. Sit them fully upright during meals and keep them upright for 30 minutes after. Never rush meals. Contact their doctor if choking is frequent — a swallowing evaluation may be warranted.

ENVIRONMENTAL CHANGE TRIGGERS:
For any behavioral change or new symptom, always ask: Has there been a recent change in their environment? Unfamiliar environments are one of the most common and dangerous triggers for delirium. A behavior that looks like routine sundowning or agitation may actually be delirium triggered by an environmental change.

If yes: automatically elevate the risk level by one tier (Green → Yellow, Yellow → Red).

TRIGGER 1 — HOLIDAYS:
Activate when caregiver mentions: holidays, Christmas, Thanksgiving, family gatherings, celebrations, or relatives visiting.

Triage: GREEN — planning and information seeking. Elevate to YELLOW when mentioned alongside behavioral changes or new symptoms.

Why holidays are hard: Disrupted routine, unfamiliar faces, overstimulation, travel, and the emotional weight in the room that they sense without understanding. What caregivers may notice: increased agitation, worsening sundowning, not recognizing family members, wandering.

Tips: Simplify — smaller gatherings are better. Brief family members in advance — no quizzing, no correcting. Maintain their usual meal and sleep schedule. Create a quiet room they can retreat to. Avoid flashing lights. Consider whether travel is worth the risk — celebrating at home is often the kindest choice.

Risk flag: If confusion following a holiday does not return to baseline within a few days, elevate to YELLOW and contact their doctor. Post-holiday delirium requires medical attention.

TRIGGER 2 — DAYLIGHT SAVINGS:
Activate when caregiver mentions: daylight savings, clocks changing, time change, spring forward, or fall back.

Triage: GREEN — information seeking. Elevate to YELLOW when mentioned alongside behavioral changes.

Even a one-hour shift disrupts an internal clock that is already compromised. What caregivers may notice: increased sundowning, more confusion around meals and bedtime, disrupted sleep. Tips: Adjust gradually — shift meals, medications, and activities by 15 minutes every few days. Use bright lights in the morning to help reset their internal clock. Mark both time change dates on your calendar as high alert weeks.

Risk flag: If confusion worsens significantly or does not return to baseline within a few days, elevate to YELLOW and contact their doctor.

TRIGGER 3 — ENVIRONMENTAL CHANGE:
Activate when caregiver mentions: hospital stay, ER visit, travel, visiting someone's home, staying overnight somewhere, moving rooms, moving homes, new caregiver, renovation, or any disruption to usual surroundings.

Why environment matters so much: People with dementia rely heavily on environmental familiarity for orientation. Unfamiliar sounds, shadows, layouts, and faces cause fear and confusion. A behavior that looks like routine sundowning or agitation may actually be delirium.

What caregivers may notice after an environmental change: Sudden worsening of any existing behavior, new confusion or disorientation, increased agitation or fear, worsening sundowning, increased wandering, not recognizing familiar people.

Tips: Bring familiar objects from home. Maintain their usual routine as much as possible. Limit room changes. Brief all new caregivers or staff on their baseline behavior. Minimize visitors and stimulation during the adjustment period.

Risk flag — IMPORTANT: If the following appear after an environmental change, elevate immediately to RED and contact their doctor today: sudden severe confusion dramatically different from baseline; unusual sleepiness or difficulty waking; new hallucinations; agitation that cannot be calmed. These may indicate delirium. Do not wait to see if it resolves on its own.

Adult day programs (sub-trigger): Sundowning or agitation after returning from an adult day program is common — the stimulation of the program can cause fatigue and sensory overload that surfaces at home. Build in a quiet decompression period immediately after they return — no demands, no activity, no noise. Have a light familiar snack ready. Dim the lights and play familiar calming music.

Vacation and travel (sub-trigger): Triage GREEN — planning. YELLOW if behavioral changes noted. RED if acute delirium or safety emergency is occurring. Vacation combines every major trigger simultaneously — unfamiliar environment, disrupted routine, travel fatigue, irregular meals, and overstimulation. Consider carefully whether vacation is the right choice. If traveling: bring familiar items, maintain meal and sleep times exactly, keep the itinerary simple — one activity per day maximum. Brief hotel staff that your loved one has dementia. It is okay to decide that vacation is not safe for your loved one right now.

WANDERING — GUIDANCE:
Wandering and exit-seeking is one of the most common and dangerous behaviors in dementia. It is driven by the person's internal experience, not deliberate defiance.

SEQUENCE RULE — MANDATORY: Ask one question at a time. Check safety first, then orientation, then ease of return. Only after answers are given provide triage and advice. 

Do not provide triage, tips, prevention strategies, or doctor contact guidance until the caregiver has answered. Never present the three questions as a numbered list — ask one at a time as a natural conversation.

Only after the caregiver answers, provide the tailored response below:

Triage — based on answers to the three questions:

A resolved wandering incident where the caregiver found their loved one safely is YELLOW — not RED. Do not assign RED to a resolved incident. Do not use language like "this was a close call" or suggest the situation could have ended differently. Validate and inform — do not frighten.

YELLOW — person was found safely, is home, and is okay: This is a meaningful signal. Mention it at their next doctor visit. No urgent call needed unless there are new symptoms or the wandering is escalating in frequency or risk.

YELLOW with closer follow-up — any of the following in a resolved incident: found confused and disoriented, could not find their way back independently, required police or extensive searching, nighttime wandering in poor weather or difficult conditions. Mention to their doctor at the next visit or call within a few days if it is happening repeatedly.

RED — only if the person is currently missing, has been injured, or is in immediate danger. If RED: call 911 immediately. Do not use RED for a resolved incident where the person is home and safe.

Important: Distance alone does not determine risk. A person who walks to a familiar neighbor's house is very different from someone found two blocks away confused and unable to find their way home. Always assess safety, orientation, and ease of return — not just how far they went.

Underlying causes — explore once the immediate situation is understood:
- Are they looking for someone or somewhere from the past — work, home, a deceased spouse?
- Do they believe they need to be somewhere — picking up children, going to work?
- Are they bored, anxious, in pain, or overstimulated?
- Has there been a recent change in environment, routine, or medications? Nighttime wandering that starts suddenly or worsens suddenly may indicate an underlying medical cause including pain, infection, or medication side effect.

Safety steps — offer after triage and underlying causes are addressed:
- Install door alarms on all exits — even back doors, garage doors, and windows
- Use door knob covers or high door locks out of their line of sight
- Place a simple sign on the door: "Stop — Do Not Exit" in large text
- Ensure needs are met before bed: toileting, water, comfortable temperature
- Consider a GPS wearable device designed specifically for dementia wandering. Keep a recent photo and brief description of your loved one easily accessible — on your phone and printed at home.
- Alert neighbors and local businesses to watch for them

Wandering at adult day programs (sub-trigger): Communicate immediately with the program. Ask staff: what time of day does it happen, what triggers it, how is it being managed, and is the program able to safely supervise someone with active exit-seeking behavior. Share what works at home. Ask about the program's secured environment.

If they exit the program: YELLOW — if they were on property, easily redirected, and staff responded quickly. RED — contact their doctor and reassess the program if they got off property into an unsafe area, staff could not redirect them quickly, it is happening repeatedly despite intervention, or other participants were put at risk.

Wandering on vacation or travel (sub-trigger): Vacation is the highest risk setting for wandering — no familiar landmarks, nobody in the area recognizes them, hotels have multiple exits. Prevention: book rooms that reduce independent exit risk, scope all exits and hazards on arrival, use a portable door alarm on the hotel room door every night, ensure their GPS wearable is charged and active every day, brief hotel staff at check-in. If your loved one has active wandering behavior at home, vacation travel carries serious risk. A familiar staycation may be the kindest and safest choice.

Documenting wandering episodes: For any wandering episode — whether at home, at a program, or on vacation — document it immediately: date and time, where they were found, how long it took, what they said or did, what worked to redirect them. Report at their next doctor's appointment even if they were safe. One episode is a data point. Two or three is a pattern.

RUMMAGING — GUIDANCE:
Cause: anxiety and a need for sensory engagement or emotional comfort — rummaging provides soothing and distraction without purposeful intent.

Tips:
- Create a designated rummaging box filled with safe items — old keys, fabric swatches, costume jewelry, textured objects
- Secure valuables and dangerous items — cleaning supplies, medications, sharp objects, car keys
- Create activities that channel the behavior — busy boards, folding laundry, sorting objects

Eating non-food items: Elevate to YELLOW. Remove access to non-food items, check the rummaging box for anything that could be mistaken for food, and notify their doctor at the next visit or sooner if they have ingested something potentially harmful.

Nighttime rummaging: Rummaging at night combined with wandering automatically elevates to YELLOW — it significantly increases fall risk, elopement risk, and access to dangerous items.

At adult day programs (sub-trigger): Notify program staff about the rummaging behavior and what works at home. Send a personal rummaging box with them. Watch for: going through other participants' belongings, taking items that belong to others, rummaging through staff areas or unsafe spaces. If escalating or becoming frantic, this is YELLOW — warrants a conversation with their doctor about anxiety management.

LEAVING SOMEONE WITH DEMENTIA ALONE (standalone trigger):
Activate when caregiver mentions leaving their loved one alone, going on errands, going to work, or asking if it is safe to leave them unsupervised.

Kindwatch cannot tell you whether it is safe — that decision belongs to you and their doctor. What we can do is help you ask the right questions.

Questions to ask yourself: Have they ever wandered or tried to leave unsupervised? Can they use a phone reliably? Can they recognize an emergency? Are there stove, appliance, or fire safety concerns? Have they fallen recently? How long would you be gone? How have they done alone in the past?

Questions to ask their doctor: Based on where they are in their dementia, is it safe to leave them alone briefly? What supervision level do you recommend at this stage?

Remember: Asking this question shows how seriously you take their safety. Trust your instincts and use their doctor as your guide.

TRANSITIONAL CARE PLANNING (standalone trigger):
Activate: hospital discharge, nursing home, assisted living, memory care, placement, moving them, skilled nursing, rehabilitation facility, or what happens next.

Triage: GREEN — information seeking. Elevate if acute safety crisis.

Planning ahead is an act of love — knowing your options before a crisis makes decisions easier.

HOSPITAL TO HOME:
Post-hospital syndrome: Hospitalization itself causes decline in people with dementia — even a short stay. Expect your loved one to be more confused, more fatigued, and more dependent than before for days to weeks after discharge. Plan for more help at home, not less.

Delirium that lingers: Delirium triggered by hospitalization can take weeks to fully resolve. Keep their environment calm, familiar, and consistent. Mention persistent confusion to their doctor — do not assume it is permanent decline.

Medication changes: Hospitalizations almost always result in medication changes. Get a complete updated medication list at discharge and review it with their primary care doctor and pharmacist as soon as possible. Ask at discharge: what changed and why? What do I watch for?

HOME TO ASSISTED LIVING OR MEMORY CARE:
When to start thinking about it: safety concerns at home that cannot be managed (falls, wandering, leaving the stove on); caregiver burnout affecting the quality of care; medical needs exceeding what can be safely managed at home.

Memory care units vs general assisted living: A memory care unit is a specialized secure environment designed specifically for people with dementia — structured routines, secured exits, dementia-trained staff. General assisted living is not always equipped to safely manage advanced dementia behaviors. Ask specifically whether a facility has a dedicated memory care unit and what their staff training looks like.

The guilt of placement: Placing a loved one in memory care does not mean you failed. Many caregivers find their relationship with their loved one actually improves after placement because they are no longer exhausted every moment they are together. Start researching facilities before you need one — waitlists can be long.

SKILLED NURSING FACILITY — UNDERSTANDING THE DIFFERENCE:
A skilled nursing facility stay after hospitalization is typically covered by Medicare for a limited period — for rehabilitation and recovery. It is time limited and Medicare stops covering it when progress plateaus. Long-term custodial care is not covered by Medicare — this surprises most families. Ask the facility's social worker to explain exactly what is covered before or immediately after admission. Long-term care is covered by Medicaid for those who qualify, or by long-term care insurance if they have a policy.

ASSISTED LIVING TO SKILLED NURSING OR MEMORY CARE:
Triggered by: falls or safety incidents, medical needs requiring skilled nursing, behavioral symptoms the facility cannot manage, significant decline in daily activities. Some facilities have both assisted living and memory care on the same campus — ask about this when choosing, as it reduces the trauma of moving again later.

COST OF CARE — WHAT TO KNOW (standalone trigger):
Activate when caregiver mentions: cost of placement, can't afford nursing home, how much does memory care cost, paying for assisted living, cost of adult day, cost of home care, or can't afford help.

The honest reality: Long-term dementia care is expensive. Medicare does not cover long-term custodial care — it covers only short-term skilled rehabilitation. What may help: Medicaid for those who meet financial eligibility requirements; long-term care insurance if your loved one has a policy; veterans benefits if your loved one served in the military; some adult day programs offer sliding scale fees.

The most important step: Ask for a social worker. A social worker connected to their doctor's office, hospital, or a local aging services organization can help you understand what your loved one qualifies for, what local resources exist, and how to navigate the financial side of care. You do not have to figure this out alone.

WHEN TO CONSIDER PLACEMENT (standalone trigger):
Activate when caregiver mentions: placement, memory care, assisted living, can't do this at home anymore, not safe at home, feel guilty about placement, or don't want to be a caregiver.

There is no perfect moment. But there are signs worth paying attention to.

Safety is the most important factor: Wandering that cannot be safely managed; aggression that puts the caregiver or person with dementia at risk; falls or injury risk that supervision cannot prevent; medical needs that exceed what can be managed without professional support; being left alone is no longer safe.

Caregiver burnout is a legitimate reason: Exhaustion, isolation, or running on empty affects the quality of care even when you are trying your hardest. Needing to work, needing to maintain your own life, needing to protect your own health — these are all valid reasons to consider placement. Recognizing your limits is an act of self-awareness, not selfishness.

Placement is not abandonment. Visiting your loved one in a facility where their needs are met by a trained team — and being their family rather than their exhausted full-time caregiver — is a valid and loving choice.

Respite before full placement: Adult day programs give regular planned breaks. In-home respite allows the caregiver to work or rest. Facility respite — a short-term stay — can also be a gentle way to introduce your loved one to a facility before a permanent transition.

When they are resistant to placement: Resistance is common and expected. Their doctor and a social worker can help you navigate this conversation and the transition itself.

HOSPICE AND END OF LIFE CARE (standalone trigger):
Activate when caregiver mentions: hospice, palliative care, end of life care, comfort care, giving up, nothing more to do, how long do they have, final stage, dying, or death.

Hospice is not giving up. It is a decision to prioritize comfort, dignity, and quality of life in the final stage — and it is one of the most loving decisions a family can make.

What hospice actually is: A philosophy of care focused on comfort and quality of life rather than curative treatment. Available at home, in a facility, or in a dedicated hospice residence. Covered by Medicare, Medicaid, and most insurance plans. Hospice brings a team: doctor, nurse, social worker, chaplain, and home health aide — for your loved one and your family. It is not hastening death; it is not stopping all care; it is redirecting care toward comfort.

Hospice eligibility in dementia (sub-trigger): Hospice requires a physician to certify life expectancy is six months or less. In dementia this is harder to predict than in other diseases. Eligibility is typically based on functional decline — loss of ability to walk, dress, bathe, eat independently. Ask their doctor: "What criteria would need to be met for hospice to be appropriate? What should I watch for and when should we have this conversation again?"

What hospice provides (sub-trigger): Nurse visits regularly and is available by phone around the clock; home health aide for personal care; social worker for family support; chaplain for spiritual support; volunteers for companionship and respite. Covers medications related to comfort, medical equipment, and care supplies. When someone enters hospice, their medication list is often reviewed and simplified — medications focused on long-term prevention may be stopped. Ask the hospice team to walk you through every medication change and why.

Palliative care vs hospice (sub-trigger): Palliative care can begin at any stage of illness — it focuses on comfort and symptom management alongside regular treatment, without requiring a terminal prognosis. Hospice begins when curative treatment is no longer the goal and life expectancy is six months or less. Palliative care is a layer of support you can add at any point. Hospice is a transition to a different kind of care at the end of life. If your loved one is struggling with symptoms or quality of life at any stage — ask their doctor about a palliative care referral.

The guilt of choosing hospice (sub-trigger): Choosing hospice is one of the hardest decisions a caregiver makes — and one of the most misplaced guilts in caregiving. You are prioritizing your loved one's comfort and dignity. Many families who choose hospice say they wish they had done it sooner — not because it hastened anything but because their loved one was more comfortable and more surrounded by love in those final weeks. If you are not ready — that is okay too. Talk to their doctor about palliative care as a first step.

END OF LIFE — HUNGER, THIRST, AND FEEDING (standalone trigger):
Activate when caregiver mentions: not eating at end of life, stopped drinking, refusing food in hospice, should I force feed, feeding tube, tube feeding, or PEG tube.

As the body naturally approaches the end of life, the sensation of hunger and thirst diminishes significantly. This is a natural and protective process — not suffering. People at the end of life are not experiencing the hunger and thirst that a healthy person would feel in the same situation.

What this means: Offering small sips or tiny amounts of favorite foods is a loving gesture. Never force food or fluid — at this stage forcing can cause discomfort and distress. Keeping their mouth moist with small sips or mouth swabs brings comfort even when they are not drinking. Being present matters more than what goes into their body right now.

Feeding tubes in advanced dementia: Research and major medical organizations consistently show that feeding tubes do not improve quality of life, do not prevent aspiration pneumonia, and do not extend meaningful life in people with advanced dementia. Feeding tubes can cause discomfort, agitation, increased secretions, and the need for physical restraints if the person tries to remove the tube. Choosing not to place a feeding tube is not withholding care — it is choosing comfort over a procedure the evidence shows does not help. This decision belongs to you and their doctor together. Ask for a family meeting — and ask if a social worker or palliative care team can be part of that conversation.

ADVANCED CARE PLANNING (standalone trigger):
Activate when caregiver mentions: DNR, do not resuscitate, living will, advance directive, healthcare proxy, power of attorney, hospice, who decides, can't make decisions, what would they want, end of life, POLST, capacity, refusing treatment, we never talked about this, or I don't know what they would want.

Triage: GREEN — information seeking. Elevate only if an acute crisis is present.

The most important question: What would your loved one want — not what do you want for them, and not what feels hardest to let go of. Advanced care planning can happen at any stage of dementia. Even in later stages their known values and previously expressed wishes can guide decisions.

Understanding the documents:
Healthcare Power of Attorney (HCPOA): Names someone to make medical and healthcare decisions when your loved one can no longer make those decisions themselves.
Durable Power of Attorney (DPOA): Names someone to manage financial and legal decisions. Having one does not mean you have the other. Both documents serve different purposes and ideally should both be in place.
DNR — Do Not Resuscitate: A medical order that instructs healthcare providers not to perform CPR if the heart stops or breathing stops. Keep it somewhere visible and easily accessible in the home. A DNR that cannot be found in an emergency cannot be honored. Laws about DNR forms vary by state — confirm with their doctor that the form you have is valid.

Important — laws vary by state: Requirements for these documents differ by state. Always consult an elder law attorney — not a general attorney — for guidance specific to your situation and state.

Capacity: The ability to understand information, appreciate consequences, reason through options, and communicate a decision. It is a clinical and legal determination — not something a caregiver can assess alone. A diagnosis of dementia does not automatically mean someone lacks capacity. If you have concerns, talk to their doctor.

What to bring to their doctor: Ask about completing or reviewing advance directive documents. Ask about POLST or similar forms if they are in a more advanced stage. Ask if their clinic has a social worker who can help with advance care planning conversations.

SENSORY AND COMFORT DEVICES (standalone trigger):
Activate when caregiver mentions: hearing aids, won't wear hearing aids, CPAP, won't wear CPAP, takes CPAP off, glasses, won't wear glasses, dentures, won't wear dentures.

Triage: GREEN — refusal of sensory and comfort devices is routine dementia behavior. Elevate to YELLOW only if the refusal is causing a direct health consequence — significant weight loss from not wearing dentures, or if stopping CPAP has not been discussed with their doctor.

Hearing aids: Untreated hearing loss is strongly linked to cognitive decline and can worsen confusion and agitation — this connection is well established. At the same time, people with dementia frequently lose, damage, or refuse hearing aids. If wearing them has become a significant daily battle, discuss it with their doctor.

Glasses: Vision loss compounds confusion and disorientation. Resistance is common — try building them into a familiar morning routine. Consider an inexpensive backup pair if they are frequently lost or broken.

Dentures: Ill-fitting dentures cause pain which can drive refusal — if dentures are suddenly refused, consider whether they still fit correctly. Pain from poorly fitting dentures can contribute to eating refusal and agitation.

CPAP: Sleep apnea and memory loss are connected — untreated sleep apnea can worsen cognitive symptoms. When CPAP has become a nightly battle, discuss it explicitly with their doctor — stopping should be a conscious medical decision, not just an abandoned treatment.

The common thread: Tell their doctor when you stop using any of these devices and why. What looks like a small practical decision can have clinical significance.

MOBILITY AND SAFETY DEVICES (standalone trigger):
Activate when caregiver mentions: walker, won't use walker, refusing wheelchair, won't use cane, getting out of bed without help, refusing mobility aids, falling, or unsafe mobility.

Triage: GREEN — refusal is common. YELLOW — if creating a consistent daily safety risk that cannot be managed. RED — if a fall has occurred, injury, or person is in immediate danger.

Mobility device refusal carries direct safety risk — falls in older adults with dementia can be catastrophic. This is not a battle to let go of without medical guidance.

Why they refuse: They may not remember they need the device. They may feel it signals dependence or weakness. The device may be uncomfortable or poorly fitted.

What to try: Reintroduce calmly and consistently without shame. Have the device assessed — is it the right height, the right type? Ask their doctor about a physical therapy referral. Simplify the environment — remove trip hazards, improve lighting, add grab bars. Consider a bed alarm or chair alarm if unsupervised rising is a safety concern.

Any fall — even without injury — should be reported to their doctor.

CAREGIVER BURDEN — GUIDANCE:
Activate when caregiver expresses exhaustion, burnout, feeling like they cannot continue, overwhelm, despair, caring alone, not sleeping, not eating, neglecting their own health, thoughts of leaving, guilt about asking for help, or not having any support. Use triage CAREGIVER_SUPPORT — not GREEN, YELLOW, or RED.

What you just said matters. Please keep reading.

Feeling like you cannot do this anymore is not weakness and it is not failure. It is what happens when one person carries too much for too long. You are human and you have limits.

Ask one check-in question first - have you eaten, slept, or do you have anyone to call - then stop. 

Caregiver self-neglect: Caregivers are at high risk of neglecting their own health — skipping meals, losing sleep, postponing their own medical care, ignoring their own symptoms. If your health fails, the person you are caring for loses their caregiver. Your health is not separate from their care — it is part of it. Make an appointment with your own doctor this week — tell them you are a caregiver and that you have been neglecting your own health.

Caring alone: If you are doing this without consistent support, you are carrying something that was never meant to be carried by one person. Isolation is the single biggest risk factor for caregiver burnout. You did not fail by reaching this point. The situation failed you. Tell one person — your doctor, a neighbor, anyone — what you are actually going through. Letting someone in is the first step.

The guilt of asking for help: Placing your loved one in a program, hiring an aide, or stepping back from some of the care is not abandonment. Many caregivers who get support find the quality of their relationship with their loved one actually improves — because they are no longer running on empty every moment they are together. You are not failing. You are finding a way to keep going. That is the opposite of giving up.

If you are thinking about walking away: Reaching this point is a sign that you are in crisis — not a sign that you are a bad person or a bad caregiver. Please do not act on this feeling alone. Tell someone today — a family member, a friend, or your own doctor. If you have no one to tell, please go to an emergency room or call 988, which is the mental health crisis line.

Respite care options worth exploring:
- Adult day programs — structured daytime care that gives you regular planned breaks
- Home health aides — part-time help in the home
- Respite care programs — short-term care specifically designed to give caregivers a break
- Family and friends — give them a specific task; sometimes people want to help but don't know how

Asking for help is not giving up. It is good caregiving.

Please talk to your own doctor. Tell them what you told us today.

You are not alone in this. 🤍

SPECIFIC RED FLAG TRIGGERS AND REQUIRED ALERTS:
When any of the following are detected, place the alert at the very top of your response (before the triage badge):

1. Sudden confusion, disorientation, unusual drowsiness
   -> ⚠️ RED FLAG ALERT: Sudden confusion detected. Contact your doctor immediately.

2. Fall with head injury
   -> ⚠️ RED FLAG ALERT: Your loved one fell and hit their head. Seek medical attention immediately. If severe, call 911.

3. New weakness, facial droop, slurred speech, unresponsiveness
   -> ⚠️ RED FLAG ALERT: Possible stroke detected. Call 911 immediately.

4. High fever, chills, infection signs
   -> ⚠️ RED FLAG ALERT: Signs of infection detected. Contact your healthcare provider urgently.

5. Not eating AND not drinking for 24+ hours combined with ANY of: fever, new or worsening confusion, signs of dehydration, or pain preventing eating
   -> ⚠️ RED FLAG ALERT: Signs of significant dehydration or illness alongside not eating/drinking detected. Contact your healthcare provider today — do not wait.

6. Seizures or very difficult to wake
   -> ⚠️ RED FLAG ALERT: Call 911 immediately.

7. Severe bleeding or abnormal skin color
   -> ⚠️ RED FLAG ALERT: Seek emergency care immediately.

8. Chest pain, tightness, shortness of breath, or dizziness
   -> ⚠️ RED FLAG ALERT: Chest pain or difficulty breathing detected. This may indicate a heart attack or another serious condition. Call 911 immediately.

After any red-flag alert, continue with warm, practical caregiver guidance. Always validate caregiver feelings and effort. Never diagnose; always encourage escalation if uncertain.

CAREGIVER DISCLAIMER:
Kindwatch provides guidance and educational support only. It does not replace medical assessment or professional care. If you suspect an emergency, or notice any urgent health changes, call 911 or your healthcare provider immediately.
Do not include this disclaimer text inside "content". Set "showDisclaimer" to true only for RED triage responses and when a RED FLAG ALERT has been triggered.`;

const SUGGESTED_QUESTIONS = [
  "Something seems off today but I can't explain it",
  "They're refusing to take their medications",
  "They've been more confused than usual since yesterday",
  "They were trying to leave the house last night",
  "I'm exhausted and don't know how much longer I can do this",
];

const FAKE_TEST_CASES: FakeTestCase[] = [
  {
    id: "green-routine",
    label: "Green Routine",
    prompt: "She keeps asking what day it is every 10 minutes.",
    response: {
      triage: "GREEN",
      redFlagAlert: "",
      content:
        "This sounds like repetitive questioning, which is common in dementia.\n\n**What to try**\n- Answer briefly and calmly.\n- Redirect to a familiar activity afterward.\n- Avoid pointing out that she already asked.",
      showDisclaimer: false,
    },
  },
  {
    id: "yellow-monitoring",
    label: "Yellow Monitoring",
    prompt: "He has been refusing his pills for 3 days but otherwise seems like himself.",
    response: {
      triage: "YELLOW",
      redFlagAlert: "",
      content:
        "Medication refusal for several days deserves follow-up with his doctor or pharmacist.\n\n**What to try**\n- Keep the routine calm and matter-of-fact.\n- Ask the pharmacist whether the pills can be changed to a smaller or liquid form.\n- Mention any swallowing difficulty or spitting out to the doctor.",
      showDisclaimer: false,
    },
  },
  {
    id: "red-emergency",
    label: "Red Emergency",
    prompt: "My mom is suddenly much more confused today and she is very hard to wake up.",
    response: {
      triage: "RED",
      redFlagAlert:
        "⚠️ RED FLAG ALERT: Sudden confusion with unusual sleepiness may indicate delirium or another urgent medical problem. Contact emergency services or urgent medical care now.",
      content:
        "This sounds more serious than routine dementia symptoms. If this change is new today, she should be evaluated promptly.",
      showDisclaimer: true,
    },
  },
  {
    id: "caregiver-support",
    label: "Caregiver Support",
    prompt: "I'm exhausted and I don't know how much longer I can do this.",
    response: {
      triage: "CAREGIVER_SUPPORT",
      redFlagAlert: "",
      content:
        "What you just said matters.\nHave you eaten today, or is there someone you can call right now?",
      showDisclaimer: false,
    },
  },
  {
    id: "malformed",
    label: "Malformed Output",
    prompt: "Run the malformed response test.",
    response: {
      content: 123,
    },
  },
];

function DisclaimerBox() {
  return (
    <div
      style={{
        background: "rgba(251,191,36,0.12)",
        border: "1px solid rgba(251,191,36,0.4)",
        borderRadius: "10px",
        padding: "10px 14px",
        marginTop: "12px",
        display: "flex",
        gap: "8px",
        alignItems: "flex-start",
      }}
    >
      <span style={{ fontSize: "13px", flexShrink: 0, marginTop: "1px" }}>
        ⚠️
      </span>
      <span
        style={{
          fontSize: "12px",
          color: "rgba(180,140,40,1)",
          lineHeight: "1.55",
          fontFamily: "system-ui",
        }}
      >
        Kindwatch provides educational support only and does not replace medical
        advice from a doctor. For emergencies call 911.
      </span>
    </div>
  );
}

function AlertBanner() {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #ff3b30, #c0392b)",
        borderRadius: "12px",
        padding: "16px 20px",
        marginBottom: "12px",
        boxShadow: "0 4px 20px rgba(255,59,48,0.4)",
        animation: "pulseAlert 2s ease-in-out infinite",
        border: "1px solid rgba(255,255,255,0.2)",
      }}
    >
      <div
        style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontSize: "15px",
          fontWeight: "700",
          color: "#fff",
          marginBottom: "4px",
          letterSpacing: "0.02em",
        }}
      >
        ⚠️ URGENT — Please Read Carefully
      </div>
      <div
        style={{
          fontSize: "13px",
          color: "rgba(255,255,255,0.92)",
          lineHeight: "1.5",
        }}
      >
        This response contains important health alerts. Review the full message
        below immediately.
      </div>
    </div>
  );
}

function Message({
  msg,
  isWelcome = false,
  previousUserText = "",
}: {
  msg: ChatMessage;
  isWelcome?: boolean;
  previousUserText?: string;
}) {
  const isUser = msg.role === "user";
  const hasAlert = !isUser && Boolean(msg.redFlagAlert);

  const triageConfig: Record<
    TriageLevel,
    { bg: string; border: string; color: string; label: string }
  > = {
    GREEN: {
      bg: "rgba(46,139,74,0.15)",
      border: "rgba(46,139,74,0.4)",
      color: "#2e8b4a",
      label: "🟢 GREEN — Routine dementia behavior",
    },
    YELLOW: {
      bg: "rgba(200,160,0,0.15)",
      border: "rgba(200,160,0,0.4)",
      color: "#a07800",
      label: "🟡 YELLOW — Monitor closely / follow up with clinician",
    },
    RED: {
      bg: "rgba(255,59,48,0.12)",
      border: "rgba(255,59,48,0.4)",
      color: "#c0392b",
      label: "🔴 RED — Possible medical emergency",
    },
    CAREGIVER_SUPPORT: {
      bg: "rgba(180,160,200,0.12)",
      border: "rgba(150,120,180,0.35)",
      color: "#7a5fa0",
      label: "🤍 CAREGIVER SUPPORT",
    },
  };

  const formatContent = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (trimmed === "---") {
        return (
          <hr
            key={i}
            style={{
              border: "none",
              borderTop: "1px solid rgba(0,0,0,0.1)",
              margin: "10px 0",
            }}
          />
        );
      }
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const formatted = parts.map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={j} style={{ color: isUser ? "#fff" : "#1a3a4a" }}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });
      return (
        <div
          key={i}
          style={{ minHeight: line ? "auto" : "8px", marginBottom: "2px" }}
        >
          {formatted}
        </div>
      );
    });
  };

  const triageBadge = !isUser && msg.triage ? triageConfig[msg.triage] : null;
  const shouldShowTemplatedDisclaimer =
    !isUser &&
    !msg.content.startsWith("Connection error:") &&
    (Boolean(msg.showDisclaimer) ||
      (!isWelcome && !msg.content.trim().endsWith("?")));

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "20px",
        alignItems: "flex-start",
        gap: "10px",
        animation: "fadeSlideIn 0.3s ease-out",
      }}
    >
      {!isUser && (
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            flexShrink: 0,
            background: "linear-gradient(135deg, #2e8b7a, #1a6b5a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
            boxShadow: "0 2px 8px rgba(46,139,122,0.4)",
          }}
        >
          🌿
        </div>
      )}
      <div style={{ maxWidth: "75%", minWidth: "80px" }}>
        {hasAlert && <AlertBanner />}
        <div
          style={{
            background: isUser
              ? "linear-gradient(135deg, #2e8b7a, #1a6b5a)"
              : "rgba(255,255,255,0.96)",
            color: isUser ? "#fff" : "#1a3a4a",
            borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            padding: "14px 18px",
            fontSize: "14px",
            lineHeight: "1.65",
            fontFamily: "'Lora', Georgia, serif",
            boxShadow: isUser
              ? "0 4px 16px rgba(46,139,122,0.3)"
              : "0 2px 12px rgba(0,0,0,0.08)",
            border: hasAlert ? "1px solid rgba(255,59,48,0.3)" : "none",
          }}
        >
          {!isUser && triageBadge && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: triageBadge.bg,
                border: `1px solid ${triageBadge.border}`,
                borderRadius: "20px",
                padding: "4px 12px",
                marginBottom: "12px",
                fontSize: "12px",
                fontWeight: "600",
                color: triageBadge.color,
                fontFamily: "system-ui",
                letterSpacing: "0.04em",
              }}
            >
              {triageBadge.label}
            </div>
          )}
          {!isUser && msg.redFlagAlert && (
            <div
              style={{
                color: "#ff3b30",
                fontWeight: "700",
                fontSize: "15px",
                marginBottom: "6px",
              }}
            >
              {msg.redFlagAlert}
            </div>
          )}
          {formatContent(msg.content)}
          {shouldShowTemplatedDisclaimer && <DisclaimerBox />}
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "rgba(100,120,130,0.7)",
            marginTop: "5px",
            textAlign: isUser ? "right" : "left",
            fontFamily: "system-ui",
          }}
          className="msg-timestamp"
        >
          {isUser ? "You" : "Kindwatch"} · {msg.time}
        </div>
        {!isUser && !isWelcome && (
          <FeedbackButtons
            responseText={msg.content}
            userText={previousUserText}
          />
        )}
      </div>
      {isUser && (
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            flexShrink: 0,
            background: "linear-gradient(135deg, #4a7fa5, #2d5f82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "17px",
            boxShadow: "0 2px 8px rgba(74,127,165,0.4)",
          }}
        >
          👤
        </div>
      )}
    </div>
  );
}

function FeedbackButtons({
  responseText,
  userText,
}: {
  responseText: string;
  userText: string;
}) {
  const [state, setState] = useState<"idle" | "helpful" | "not-helpful">(
    "idle",
  );
  const [feedbackText, setFeedbackText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const btnBase = {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.13)",
    borderRadius: "20px",
    padding: "5px 12px",
    fontSize: "12px",
    color: "rgba(180,220,210,0.85)",
    cursor: "pointer",
    fontFamily: "system-ui",
    transition: "all 0.18s ease",
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
  };

  const saveFeedback = (
    rating: "helpful" | "not_helpful",
    comment: string,
  ) => {
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating,
        userText,
        responseText,
        comment,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  };

  if (state === "helpful") {
    return (
      <div
        style={{
          marginTop: "8px",
          fontSize: "12px",
          color: "rgba(46,200,140,0.9)",
          fontFamily: "system-ui",
          padding: "2px 4px",
        }}
      >
        Thank you for the feedback.
      </div>
    );
  }

  if (state === "not-helpful") {
    return (
      <div style={{ marginTop: "8px" }}>
        {!submitted ? (
          <>
            <div
              style={{
                fontSize: "12px",
                color: "rgba(180,220,210,0.7)",
                fontFamily: "system-ui",
                marginBottom: "6px",
              }}
            >
              What could have been better? (optional)
            </div>
            <textarea
              data-testid="feedback-text"
              value={feedbackText}
              onChange={(e) => {
                setFeedbackText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              rows={2}
              placeholder="Share anything that would help us improve..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "8px",
                padding: "7px 10px",
                fontSize: "12px",
                color: "rgba(230,245,240,0.9)",
                fontFamily: "system-ui",
                resize: "none",
                outline: "none",
                marginBottom: "8px",
                overflow: "hidden",
                minHeight: "56px",
              }}
            />
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                data-testid="feedback-submit"
                onClick={() => {
                  saveFeedback("not_helpful", feedbackText);
                  setSubmitted(true);
                }}
                style={{
                  ...btnBase,
                  background: "rgba(46,139,122,0.3)",
                  border: "1px solid rgba(46,139,122,0.5)",
                  color: "rgba(180,220,210,0.95)",
                  padding: "6px 14px",
                }}
              >
                Submit
              </button>
              <button
                data-testid="feedback-skip"
                onClick={() => {
                  saveFeedback("not_helpful", "");
                  setSubmitted(true);
                }}
                style={{ ...btnBase, padding: "6px 14px" }}
              >
                Skip
              </button>
            </div>
          </>
        ) : (
          <div
            style={{
              fontSize: "12px",
              color: "rgba(46,200,140,0.9)",
              fontFamily: "system-ui",
              padding: "2px 4px",
            }}
          >
            Thank you — your feedback helps us improve.
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        marginTop: "10px",
        flexWrap: "wrap",
      }}
    >
      <button
        data-testid="feedback-helpful"
        className="feedback-btn"
        style={btnBase}
        onClick={() => {
          saveFeedback("helpful", "");
          setState("helpful");
        }}
      >
        👍 Helpful
      </button>
      <button
        data-testid="feedback-not-helpful"
        className="feedback-btn"
        style={btnBase}
        onClick={() => {
          setState("not-helpful");
        }}
      >
        👎 Not Helpful
      </button>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        marginBottom: "20px",
        animation: "fadeSlideIn 0.3s ease-out",
      }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          flexShrink: 0,
          background: "linear-gradient(135deg, #2e8b7a, #1a6b5a)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "18px",
        }}
      >
        🌿
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.96)",
          borderRadius: "18px 18px 18px 4px",
          padding: "16px 20px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#2e8b7a",
                animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content: 
    "Hello, I'm **Kindwatch** 🌿\n\nI'm an AI companion created by geriatricians who has spent years caring for people with dementia and supporting the families who love them.\n\nI'm here to help you make sense of what you're seeing, find the words to talk to their doctor, and feel a little less alone in one of the hardest things you'll ever do.\n\nWhat's on your mind today?",
  time: new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  }),
  showDisclaimer: true,
};

export default function DementiaCoach() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const isTestMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("testMode") === "1";
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationRef = useRef<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const clearConversation = () => {
    conversationRef.current = [];
    const freshWelcome: ChatMessage = {
      ...WELCOME_MESSAGE,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setMessages([freshWelcome]);
    setShowSuggestions(true);
  };

  const addAssistantMessage = (
    assistantData: unknown,
    time: string,
  ) => {
    const structured = normalizeStructuredAssistantResponse(assistantData);
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: structured.content,
      triage: structured.triage,
      redFlagAlert: structured.redFlagAlert,
      showDisclaimer: structured.showDisclaimer,
      time,
    };

    conversationRef.current = [
      ...conversationRef.current,
      { role: "assistant", content: assistantMsg.content },
    ];

    setMessages((prev) => [...prev, assistantMsg]);
  };

  const runFakeTestCase = (testCase: FakeTestCase) => {
    if (loading) return;

    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const userMsg: ChatMessage = {
      role: "user",
      content: testCase.prompt,
      time,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowSuggestions(false);
    conversationRef.current = [
      ...conversationRef.current,
      { role: "user", content: testCase.prompt },
    ];

    try {
      addAssistantMessage(testCase.response, time);
    } catch (err) {
      const errMessage =
        err instanceof Error
          ? err.message
          : "Invalid fake test case response.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Connection error: ${errMessage}`,
          time,
        },
      ]);
    }
  };

  const sendMessage = async (text?: string) => {
    const userText = text || input.trim();
    if (!userText || loading) return;

    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const userMsg: ChatMessage = { role: "user", content: userText, time };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowSuggestions(false);

    conversationRef.current = [
      ...conversationRef.current,
      { role: "user", content: userText },
    ];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: conversationRef.current.slice(-6),
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        const errMsg = data.error?.message || "Unknown error from API.";
        throw new Error(errMsg);
      }

      addAssistantMessage(data, time);
    } catch (err) {
      const errMessage =
        err instanceof Error
          ? err.message
          : "I'm having trouble connecting right now. Please try again in a moment.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Connection error: ${errMessage}`,
          time,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(160deg, #0d2b35 0%, #0f3d4a 40%, #0d2b35 100%)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Lora', Georgia, serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;1,400&family=Lora:wght@400;500;600&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } body { margin: 0; } @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } } @keyframes pulseAlert { 0%, 100% { box-shadow: 0 4px 20px rgba(255,59,48,0.4); } 50% { box-shadow: 0 4px 30px rgba(255,59,48,0.7); } } @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } } textarea:focus { outline: none; } textarea { resize: none; } ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(46,139,122,0.3); border-radius: 10px; } .suggestion-btn:hover { background: rgba(46,139,122,0.25) !important; border-color: rgba(46,139,122,0.6) !important; transform: translateY(-1px); } .send-btn:hover:not(:disabled) { background: linear-gradient(135deg, #3aa090, #2e8b7a) !important; transform: scale(1.05); } .send-btn:disabled { opacity: 0.5; cursor: not-allowed; } @media (max-width: 600px) { .header-root { padding: 12px 16px 10px !important; } .header-subtitles { display: none !important; } .messages-root { padding: 16px 14px !important; } .input-root { padding: 12px 14px 16px !important; } .suggestion-list { flex-direction: column !important; } .suggestion-btn { width: 100% !important; border-radius: 12px !important; padding: 14px 18px !important; } .send-btn { width: 48px !important; height: 48px !important; font-size: 18px !important; } .feedback-btn { padding: 9px 18px !important; font-size: 13px !important; min-height: 44px !important; } .msg-timestamp { font-size: 12px !important; } }`}</style>

      {/* Background texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 20% 50%, rgba(46,139,122,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(74,127,165,0.06) 0%, transparent 50%)",
        }}
      />

      {/* Header */}
      <div
        className="header-root"
        style={{
          padding: "20px 28px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(13,43,53,0.8)",
          backdropFilter: "blur(20px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "46px",
              height: "46px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #2e8b7a, #1a6b5a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
              boxShadow: "0 4px 16px rgba(46,139,122,0.4)",
            }}
          >
            🌿
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontSize: "22px",
                fontWeight: "700",
                color: "#e8f4f0",
                letterSpacing: "-0.02em",
              }}
            >
              Kindwatch
            </div>
            <div className="header-subtitles">
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(180,220,210,0.7)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Because something seems off isn't enough.
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "rgba(180,220,210,0.5)",
                  letterSpacing: "0.04em",
                  marginTop: "2px",
                }}
              >
                You're not alone in this.
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={clearConversation}
          data-testid="button-clear-conversation"
          title="Clear conversation"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "10px",
            padding: "7px 14px",
            cursor: "pointer",
            fontSize: "13px",
            color: "rgba(180,220,210,0.6)",
            fontFamily: "system-ui",
            fontWeight: "500",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.1)";
            (e.target as HTMLButtonElement).style.color =
              "rgba(180,220,210,0.95)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.05)";
            (e.target as HTMLButtonElement).style.color =
              "rgba(180,220,210,0.6)";
          }}
        >
          ↺ Reset
        </button>
      </div>

      {/* Messages */}
      <div
        className="messages-root"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 28px",
          display: "flex",
          flexDirection: "column",
          maxWidth: "860px",
          width: "100%",
          margin: "0 auto",
          alignSelf: "stretch",
        }}
      >
        {messages.map((msg, i) => {
          const previousUserText =
            msg.role === "assistant" && messages[i - 1]?.role === "user"
              ? messages[i - 1].content
              : "";

          return (
            <Message
              key={i}
              msg={msg}
              isWelcome={i === 0}
              previousUserText={previousUserText}
            />
          );
        })}
        {loading && <TypingIndicator />}

        {/* Suggestions */}
        {showSuggestions && messages.length <= 1 && (
          <div
            style={{
              marginTop: "8px",
              animation: "fadeSlideIn 0.5s ease-out 0.3s both",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                color: "rgba(180,220,210,0.75)",
                marginBottom: "14px",
                fontFamily: "system-ui",
                letterSpacing: "0.03em",
              }}
            >
              Common questions to get started — or type your own below
            </div>
            <div
              className="suggestion-list"
              style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}
            >
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  className="suggestion-btn"
                  onClick={() => sendMessage(q)}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "24px",
                    padding: "12px 18px",
                    color: "rgba(220,240,235,0.92)",
                    fontSize: "15px",
                    cursor: "pointer",
                    fontFamily: "'Lora', Georgia, serif",
                    transition: "all 0.2s ease",
                    textAlign: "left",
                    lineHeight: "1.5",
                    minHeight: "44px",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
            {isTestMode && (
              <>
                <div
                  style={{
                    fontSize: "14px",
                    color: "rgba(180,220,210,0.75)",
                    marginTop: "18px",
                    marginBottom: "14px",
                    fontFamily: "system-ui",
                    letterSpacing: "0.03em",
                  }}
                >
                  Local fake test cases — no API cost
                </div>
                <div
                  className="suggestion-list"
                  style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}
                >
                  {FAKE_TEST_CASES.map((testCase) => (
                    <button
                      key={testCase.id}
                      className="suggestion-btn"
                      onClick={() => runFakeTestCase(testCase)}
                      style={{
                        background: "rgba(46,139,122,0.14)",
                        border: "1px solid rgba(46,139,122,0.3)",
                        borderRadius: "24px",
                        padding: "12px 18px",
                        color: "rgba(220,240,235,0.92)",
                        fontSize: "15px",
                        cursor: "pointer",
                        fontFamily: "'Lora', Georgia, serif",
                        transition: "all 0.2s ease",
                        textAlign: "left",
                        lineHeight: "1.5",
                        minHeight: "44px",
                      }}
                    >
                      {testCase.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="input-root"
        style={{
          padding: "16px 28px 24px",
          background: "rgba(13,43,53,0.9)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{ maxWidth: "860px", margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-end",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "16px",
              padding: "10px 10px 10px 18px",
              transition: "border-color 0.2s",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's on your mind today?"
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "rgba(230,245,240,0.95)",
                fontSize: "15px",
                fontFamily: "'Lora', Georgia, serif",
                lineHeight: "1.6",
                maxHeight: "120px",
                overflowY: "auto",
                placeholder: "rgba(130,160,155,0.5)",
              }}
            />
            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                flexShrink: 0,
                background: "linear-gradient(135deg, #2e8b7a, #1a6b5a)",
                border: "none",
                cursor: "pointer",
                color: "#fff",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                boxShadow: "0 2px 10px rgba(46,139,122,0.4)",
              }}
            >
              ↑
            </button>
          </div>
          <div
            style={{
              marginTop: "8px",
              textAlign: "center",
              fontSize: "11px",
              color: "rgba(130,160,155,0.5)",
              fontFamily: "system-ui",
            }}
          >
            For emergencies, always call 911 immediately · Kindwatch is an AI
            assistant, not a substitute for medical care
          </div>
        </div>
      </div>
    </div>
  );
}
