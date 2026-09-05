const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SectionBuilder,
    ThumbnailBuilder
} = require("discord.js");

/*
 * Pixel Villa Support
 * Shared Components V2 UI
 *
 * Default: Sky Blue
 * Success: Green
 * Error: Red
 */

const COLORS = {
    SKY_BLUE: 0x38BDF8,
    GREEN: 0x57F287,
    RED: 0xED4245
};

/**
 * Creates a Pixel Villa Components V2 card.
 *
 * @param {Object} options
 * @param {number} options.color - Accent color
 * @param {string} options.content - Main card content
 * @param {string|null} options.avatarURL - User avatar URL
 * @param {string} options.avatarDescription - Avatar alt text
 * @param {boolean} options.separators - Add separators between sections
 * @returns {ContainerBuilder}
 */
function createCard({
    color = COLORS.SKY_BLUE,
    content = "",
    avatarURL = null,
    avatarDescription = "User avatar",
    separators = false
} = {}) {
    const container = new ContainerBuilder()
        .setAccentColor(color);

    const sections = content.split("\n---SEPARATOR---\n");

    /*
     * If a PFP is provided, put it on the right side
     * using a Components V2 Section + Thumbnail.
     */
    sections.forEach((section, index) => {
        const text = new TextDisplayBuilder()
            .setContent(section);

        if (avatarURL && index === 0) {
            const thumbnail = new ThumbnailBuilder()
                .setURL(avatarURL)
                .setDescription(avatarDescription);

            const sectionComponent = new SectionBuilder()
                .addTextDisplayComponents(text)
                .setThumbnailAccessory(thumbnail);

            container.addSectionComponents(sectionComponent);
        } else {
            container.addTextDisplayComponents(text);
        }

        if (separators && index < sections.length - 1) {
            container.addSeparatorComponents(
                new SeparatorBuilder()
            );
        }
    });

    return container;
}

/**
 * Creates a user avatar URL.
 *
 * @param {User|GuildMember} user
 * @returns {string|null}
 */
function getAvatarURL(user) {
    if (!user) return null;

    const target = user.user || user;

    if (!target || typeof target.displayAvatarURL !== "function") {
        return null;
    }

    return target.displayAvatarURL({
        extension: "png",
        size: 128
    });
}

/**
 * Returns Components V2 message options.
 *
 * @param {ContainerBuilder} container
 * @returns {Object}
 */
function messageOptions(container) {
    return {
        components: [container],
        flags: 32768
    };
}

module.exports = {
    COLORS,
    createCard,
    getAvatarURL,
    messageOptions
};