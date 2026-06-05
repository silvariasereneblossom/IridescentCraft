package celia.adwadg.linearxp.Capability;

import celia.adwadg.linearxp.IAccuratedExp;

public class AccuratedExp implements IAccuratedExp {
    private long accuratedExp = 0L; // 存储为实际经验的1000倍

    @Override
    public long getAccuratedExp() {
        return this.accuratedExp;
    }

    @Override
    public void setAccuratedExp(long value) {
        this.accuratedExp = Math.max(0, value); // 确保不为负数
    }

    @Override
    public void addAccuratedExp(long amount) {
        this.accuratedExp = Math.max(0, this.accuratedExp + amount);
    }

    @Override
    public void removeAccuratedExp(long amount) {
        this.accuratedExp = Math.max(0, this.accuratedExp - amount);
    }

    @Override
    public int getActualExp() {
        // 取证操作：除以1000并向下取整
        return (int) (this.accuratedExp / 1000);
    }

    @Override
    public void setActualExp(int exp) {
        // 乘以1000存储
        this.accuratedExp = Math.max(0, (long) exp * 1000);
    }

    @Override
    public void addActualExp(int exp) {
        this.accuratedExp = Math.max(0, this.accuratedExp + ((long) exp * 1000));
    }
}
