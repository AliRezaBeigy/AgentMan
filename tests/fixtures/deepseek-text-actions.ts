/** Realistic deepseek-coder-v2:lite text-action responses from agent runs. */

export const DEEPSEEK_LITE_MODEL = "deepseek-coder-v2:lite"

export const deepseekClickWorkExperience = ` \`\`\`json
{
  "action": "click",
  "selector": "button[onclick*='showAddnewSkill(\\'cvjob\\')']"
}
\`\`\``

export const deepseekClickWithId = `\`\`\`json
{"action":"click","selector":"#add-experience-btn"}
\`\`\``

export const deepseekFillFieldsWorkExperience = `\`\`\`json
{
  "action": "fill_fields",
  "fields": [
    {"selector": "[data-agentman-field-key=\\"Work experience - Title\\"]", "value": "Teaching Assistant (Advanced Programming)"},
    {"selector": "[data-agentman-field-key=\\"Work experience - Employer\\"]", "value": "Dr. Azadeh Mansouri"},
    {"selector": "[data-agentman-field-key=\\"Work experience - City\\"]", "value": "Tehran"},
    {"selector": "[data-agentman-field-key=\\"Work experience - Country\\"]", "value": "SE"},
    {"selector": "[data-agentman-field-key=\\"Work experience - From\\"]", "value": "2022"},
    {"selector": "[data-agentman-field-key=\\"Work experience - To\\"]", "value": "2022"}
  ]
}
\`\`\``

export const deepseekFillFieldsWithIds = `\`\`\`json
{"action":"fill_fields","fields":[{"selector":"#job-title","value":"Teaching Assistant"},{"selector":"#job-company","value":"Dr. Azadeh Mansouri"}]}
\`\`\``

export const deepseekDone = `\`\`\`json
{"action":"done","message":"Added all work experience and education entries."}
\`\`\``

export const deepseekBrokenAction = `\`\`\`json
{"action": "click", "selector": broken}
\`\`\``

export const deepseekNarrationOnly =
  "I'll help you add your work experience and education. Let me open the form first."

export const deepseekToolsNotSupportedError =
  "registry.ollama.ai/library/deepseek-coder-v2:lite does not support tools"

/** Malformed JSON — inner double quotes break standard parsing. */
export const deepseekBrokenOnclickQuotes = ` \`\`\`json
{
  "action": "click",
  "selector": "button[onclick*="showAddnewSkill('cvjob')"]"
}
\`\`\``

export const deepseekClickBySection = ` \`\`\`json
{"action":"click","section":"Work experience"}
\`\`\``
