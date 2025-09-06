--
-- PostgreSQL database dump
--

\restrict QkWEfwYrL2a6lAkyrSbaeaHrMImtKEZTH87oPS5lsNgFhcxQ1pMNLXNvg8SJpOy

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name text NOT NULL
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_del_contrib; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_del_contrib ON public.categories FOR DELETE USING (public.app_is_contributor());


--
-- Name: categories categories_delete_admin_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_delete_admin_owner ON public.categories FOR DELETE USING (public.app_is_admin_or_owner());


--
-- Name: categories categories_ins_contrib; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_ins_contrib ON public.categories FOR INSERT WITH CHECK (public.app_is_contributor());


--
-- Name: categories categories_insert_admin_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_insert_admin_owner ON public.categories FOR INSERT WITH CHECK (public.app_is_admin_or_owner());


--
-- Name: categories categories_sel_contrib; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_sel_contrib ON public.categories FOR SELECT TO authenticated USING (public.app_is_contributor());


--
-- Name: categories categories_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_select_authenticated ON public.categories FOR SELECT USING (public.app_is_authenticated());


--
-- Name: categories categories_upd_contrib; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_upd_contrib ON public.categories FOR UPDATE USING (public.app_is_contributor()) WITH CHECK (public.app_is_contributor());


--
-- Name: categories categories_update_admin_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_update_admin_owner ON public.categories FOR UPDATE USING (public.app_is_admin_or_owner()) WITH CHECK (public.app_is_admin_or_owner());


--
-- PostgreSQL database dump complete
--

\unrestrict QkWEfwYrL2a6lAkyrSbaeaHrMImtKEZTH87oPS5lsNgFhcxQ1pMNLXNvg8SJpOy

