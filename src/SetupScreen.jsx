import { useState } from 'react';

const DEFAULT_P1 = {
  name: 'Alex Chen',
  title: 'Senior Software Engineer',
  company: 'Google',
  skills: 'Python, Machine Learning, React, Leadership, AWS',
  experience: '5',
};
const DEFAULT_P2 = {
  name: 'Jordan Smith',
  title: 'Startup Founder & CEO',
  company: 'TechStartup Inc.',
  skills: 'JavaScript, Sales, Product, Marketing, Blockchain',
  experience: '8',
};

function ProfileForm({ player, data, onChange }) {
  const fields = [
    { key: 'name', label: 'Full Name', placeholder: 'Jane Doe' },
    { key: 'title', label: 'Job Title', placeholder: 'Senior Engineer / CEO / Director…' },
    { key: 'company', label: 'Company', placeholder: 'Google / Startup Inc…' },
    { key: 'skills', label: 'Top Skills', placeholder: 'Python, Leadership, AWS, React…' },
    { key: 'experience', label: 'Years of Experience', placeholder: '5', type: 'number' },
  ];

  return (
    <div className="profile-form">
      <div className="profile-form-header">
        <div className={`player-badge player-badge--${player}`}>P{player}</div>
        <h2>Player {player} — LinkedIn Profile</h2>
      </div>
      {fields.map(f => (
        <div className="field" key={f.key}>
          <label>{f.label}</label>
          <input
            type={f.type || 'text'}
            value={data[f.key]}
            placeholder={f.placeholder}
            onChange={e => onChange(f.key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

export default function SetupScreen({ onStart }) {
  const [p1, setP1] = useState(DEFAULT_P1);
  const [p2, setP2] = useState(DEFAULT_P2);

  const update = (setter) => (key, val) => setter(prev => ({ ...prev, [key]: val }));

  function buildProfile(data) {
    return {
      name: data.name || 'Unknown',
      title: data.title || 'Developer',
      company: data.company || 'Unknown Co.',
      skills: data.skills.split(',').map(s => s.trim()).filter(Boolean),
      experience: parseInt(data.experience) || 1,
    };
  }

  function handleStart() {
    onStart(buildProfile(p1), buildProfile(p2));
  }

  return (
    <div className="setup-screen">
      <div className="setup-title">
        <span className="setup-title-icon">⚔️</span>
        <h1>Career Arena</h1>
        <p className="setup-subtitle">Enter your LinkedIn profiles to generate your decks</p>
      </div>

      <div className="setup-forms">
        <ProfileForm player={1} data={p1} onChange={update(setP1)} />
        <div className="setup-vs">VS</div>
        <ProfileForm player={2} data={p2} onChange={update(setP2)} />
      </div>

      <button className="start-btn" onClick={handleStart}>
        ⚔️ Generate Decks &amp; Battle!
      </button>
    </div>
  );
}
