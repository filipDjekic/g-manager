package com.game_manager.gm.common.dto;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

/** SQL and ordering must be server-owned; all caller values are bound parameters. */
public final class SqlPages {
    private SqlPages() {}
    public static <T> PageResponse<T> query(JdbcTemplate jdbc, String select, String order, RowMapper<T> mapper, int page, int size, Object... args) {
        var request=PageRequests.of(page,size,org.springframework.data.domain.Sort.unsorted());
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM ("+select+") page_count",Long.class,args);
        List<Object> parameters=new ArrayList<>(Arrays.asList(args));
        parameters.add(request.getPageSize()); parameters.add(request.getOffset());
        var content=jdbc.query(select+" ORDER BY "+order+" LIMIT ? OFFSET ?",mapper,parameters.toArray());
        return new PageResponse<>(content,request.getPageNumber(),request.getPageSize(),total,(int)Math.ceil((double)total/request.getPageSize()));
    }
    public static PageResponse<java.util.Map<String,Object>> maps(JdbcTemplate jdbc,String select,String order,int page,int size,Object... args) {
        return query(jdbc,select,order,new org.springframework.jdbc.core.ColumnMapRowMapper(),page,size,args);
    }
}
