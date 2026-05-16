import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				// JAK LI Regimental Flag Palette: Scarlet · Black · Gold
				bg: {
					base: '#08060a',
					panel: '#110e12',
					'panel-2': '#181318',
					elev: '#20181c'
				},
				border: {
					DEFAULT: '#2a1f24',
					strong: '#3a2a30'
				},
				text: {
					primary: '#f5ebe2',
					secondary: '#a89690',
					dim: '#6e5c58'
				},
				scarlet: {
					DEFAULT: '#cc1a2a',
					bright: '#ff2d3f',
					dim: '#8a0f1c'
				},
				gold: {
					DEFAULT: '#d4a72c',
					bright: '#f0c14b',
					dim: '#9c7a1f'
				}
			},
			fontFamily: {
				mono: ['JetBrains Mono', 'monospace'],
				geist: ['Geist Mono', 'JetBrains Mono', 'monospace'],
				display: ['Barlow Condensed', 'JetBrains Mono', 'monospace']
			},
			fontSize: {
				tiny: ['9.5px', { lineHeight: '1.4', letterSpacing: '0.12em' }]
			},
			animation: {
				blink: 'blink 1.4s steps(2, jump-none) infinite',
				draw: 'draw 3s ease forwards'
			},
			keyframes: {
				blink: { '50%': { opacity: '0.3' } },
				draw: { to: { strokeDashoffset: '0' } }
			}
		}
	},
	plugins: [forms]
} satisfies Config;
