/**
 * The list of contents is a popover on a phone, and the browser opens and closes it with no script. It
 * cannot tell that a link inside has moved the page, though, so this puts the menu away afterward.
 */
export const closeMenusAfterNavigation = (): void => {
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return
    const menu = event.target.closest("a")?.closest<HTMLElement>("[popover]")
    if (menu?.matches(":popover-open") === true) menu.hidePopover()
  })
}
