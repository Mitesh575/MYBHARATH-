# FaultLab demo guide

## Opening pitch (30 seconds)

“Following a lab manual is different from fixing a system that fails. FaultLab gives learners a safe place to investigate realistic failures. We assess the evidence behind the answer and whether the proposed repair actually restores the system.”

## Demonstration (3 minutes)

Start **Practice**. The temperature display is frozen. Apply a chamber setpoint of 45°C. The model advances in logical seconds when you act; it is not a real-time hardware feed.

Use **Raw sensor reading**. Before measuring, write: “If the sensor responds, the raw value should rise toward the new chamber setpoint.” Then use **Controller trace** with: “The controller should use a recent sample and follow the raw value.”

Interpret the observations:

| Evidence after changing the input | Likely family | Targeted repair |
| --- | --- | --- |
| Raw value remains at its starting value; controller uses fresh sample numbers | Sensor output stuck | Replace sensor module |
| Raw value changes; controller stays at its starting value and uses sample #0 | Firmware reuses an old sample | Correct firmware sample refresh |
| Raw and controller values change; packets are sent but not acknowledged; dashboard age grows | Communication drops updates | Restore communication link |

If needed, run **Communication check**. Select the relevant evidence records and submit a diagnosis that explains where new information stops. Apply the repair and choose recovery verification. The model checks settled readings at two temperatures rather than accepting one coincidental match.

Open the report. Show the rubric, learner explanation, verification table and event replay. Point out that prediction text is recorded for instructor review; the prototype does not claim to automatically grade its reasoning quality.

## Independent assessment (30 seconds)

Start **Assessment**. The starting temperature and thermal response can differ. Hints are disabled and the server permits one diagnosis and one repair. This checks performance on a fresh case within the existing fault families.

## AI demonstration (optional)

With Ollama enabled, ask a specific question in the coach panel. The AI sees observations, not the hidden answer. If no model is reachable, show the clearly labelled guided fallback and explain the distinction. Do not present rule-based guidance as a live AI response.

## Closing pitch (30 seconds)

“Our contribution is the troubleshooting workflow: predict, measure, compare, diagnose, repair and verify. Next, we would co-design scenarios with ITI and polytechnic instructors and evaluate whether learners need fewer hints and make better supported diagnoses on new cases.”

## Honest answers to judging questions

- **Is it a digital twin?** It is a simplified deterministic teaching simulation. It has not been calibrated against physical equipment.
- **Is the score a certification?** No. It is a transparent workflow rubric; an instructor reviews reasoning quality.
- **Does AI decide the readings?** No. The simulator controls all values and outcomes. AI can only suggest investigative questions.
- **Where is GIS?** This prototype fits the AI/emerging-technology part of the theme; it does not add an unrelated GIS feature.
- **What is the impact evidence?** No learner impact study has been completed. A pilot should measure new-case accuracy, unnecessary tests and hints used before making impact claims.
