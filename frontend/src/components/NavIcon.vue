<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <template v-if="name === 'home'">
            <path d="m3 11 9-8 9 8" />
            <path d="M5 10v10h14V10M9 20v-6h6v6" />
        </template>
        <template v-else-if="name === 'calendar'">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </template>
        <template v-else-if="name === 'add'">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v8M8 12h8" />
        </template>
        <template v-else-if="name === 'facility'">
            <path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01" />
        </template>
        <template v-else-if="name === 'notice'">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </template>
        <template v-else-if="name === 'video'">
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="m10 9 5 3-5 3Z" />
        </template>
        <template v-else-if="name === 'team'">
            <circle cx="9" cy="8" r="3" />
            <circle cx="17" cy="9" r="2" />
            <path d="M3 20c0-4 2-7 6-7s6 3 6 7M15 14c3 0 5 2 5 5" />
        </template>
        <template v-else-if="name === 'game'">
            <circle cx="12" cy="12" r="9" />
            <path
                d="M12 3c-3 3-4 6-4 9s1 6 4 9M12 3c3 3 4 6 4 9s-1 6-4 9M3.5 10c4 2 13 2 17 0M3.5 14c4-2 13-2 17 0"
            />
        </template>
        <template v-else-if="name === 'ranking'">
            <path d="M5 20V10h4v10M10 20V4h4v16M15 20v-7h4v7M3 20h18" />
        </template>
        <template v-else>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-5 3-8 8-8s8 3 8 8" />
        </template>
    </svg>
</template>
