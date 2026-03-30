particle minecraft:dust 1 0 0 1 ~ ~1 ~ 0.75 0.75 0.75 0 175

power grant @e[type=!#icraft:untargetable,distance=..2] icraft:origin/witch-of-ink/color/red

execute as @e[type=!#icraft:untargetable,distance=..2] at @s store result score @s Witch_of_Ink run power has @s icraft:origin/witch-of-ink/color/green

execute as @e[type=!#icraft:untargetable,distance=..2] at @s if score @s Witch_of_Ink matches 1 run function icraft:witch-of-ink/brush/yellow
power revoke @e[type=!#icraft:untargetable,distance=..2] icraft:origin/witch-of-ink/color/green
power revoke @e[type=!#icraft:untargetable,distance=..2] icraft:origin/witch-of-ink/color/blue